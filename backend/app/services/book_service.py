import contextlib
import logging
import os
import shutil
import sqlite3
from typing import Any, cast

from ..config import LIBRARY_DIR, UPLOADS_DIR
from ..dal import books as dal
from ..dtos.books import (
    BookDetailResponse, BookFileLookup, BookListResponse, BookUpdateData, UpdateBookBody,
    UpdateBookResponse,
)
from ..events import EventScope, publish_domain_event_after_commit
from ..exceptions import BadInputError, ConflictError, NotFoundError
from ..fs_utils import assert_within
from ..logging_utils import safe as safe_log
from . import cover_service, filters_service, thumb
from ..dtos.book_card import BookCardItem
from .book_file_writer import _safe_ext, prepare_book_format_path, register_and_linearize
from .book_item_builder import row_to_book_card_item, row_to_book_detail_item
from .entity_resolver import resolve_authors, resolve_series, resolve_tags
from .temp_cleanup import cleanup_temp_session, find_temp_file

log = logging.getLogger("librarium.services.books")

_BOOK_NOT_FOUND = "Book not found"

_BOOK_UPDATE_EVENT_FIELDS = {
    "title": "title",
    "description": "description",
    "publisher": "publisher",
    "pub_date": "pubDate",
    "isbn": "identifiers",
    "author_ids": "authors",
    "series_id": "series",
    "series_number": "seriesNumber",
    "tag_ids": "tags",
    "language": "language",
}

_USER_SCOPED_BOOK_EVENT_FIELDS = {
    "rating",
    "isRead",
    "is_read",
    "isHidden",
    "is_hidden",
    "hidden",
}


def _library_event_book_payload(response: UpdateBookResponse) -> dict[str, object]:
    book = response.model_dump(mode="json", by_alias=True)["book"]
    return {
        key: value
        for key, value in book.items()
        if key not in _USER_SCOPED_BOOK_EVENT_FIELDS
    }


def _current_isbn(detail: BookDetailResponse) -> str | None:
    for identifier in detail.identifiers:
        if identifier.type == "isbn":
            return identifier.value
    return None


def _metadata_changed_fields(
    body: UpdateBookBody,
    data: BookUpdateData,
    current: BookDetailResponse,
) -> list[str]:
    changed: list[str] = []
    for field_name, event_field in _BOOK_UPDATE_EVENT_FIELDS.items():
        if field_name not in body.model_fields_set:
            continue
        if _metadata_field_changed(field_name, data, current):
            changed.append(event_field)
    return changed


def _metadata_field_changed(
    field_name: str,
    data: BookUpdateData,
    current: BookDetailResponse,
) -> bool:
    if field_name == "isbn":
        return (data.get("isbn") or None) != _current_isbn(current)
    if field_name == "author_ids":
        return set(data.get("author_ids", [])) != {author.id for author in current.book.authors}
    if field_name == "tag_ids":
        return set(data.get("tag_ids", [])) != {tag.id for tag in current.book.tags}
    if field_name == "series_id":
        current_series_id = current.book.series.id if current.book.series else None
        return data.get("series_id") != current_series_id
    return data.get(field_name) != getattr(current.book, field_name)


def _changed_book_fields(
    metadata_fields: list[str],
    *,
    files_changed: bool,
    cover_changed: bool,
) -> list[str]:
    fields = list(metadata_fields)
    if files_changed:
        fields.append("files")
    if cover_changed:
        fields.append("coverPath")
    return fields


def delete_book(db: sqlite3.Connection, book_id: int) -> None:
    """Delete book. FS first, then DB.

    Intentionally FS-first: if FS fails, DB is untouched and state is consistent.
    If DB fails after FS (extremely unlikely with SQLite CASCADE),
    orphan files remain but user can retry.
    DB-first and FSTransaction approaches were tried and reverted — they create
    false transactional guarantees that break at the db_session commit boundary.
    """
    if not dal.book_exists(db, book_id):
        raise NotFoundError(_BOOK_NOT_FOUND)

    book_dir = str(LIBRARY_DIR / str(book_id))
    if os.path.isdir(book_dir):
        shutil.rmtree(book_dir)

    dal.delete_book(db, book_id)

    # Thumb is cache — best-effort, after the critical path
    try:
        thumb.invalidate(book_id)
    except OSError:
        log.warning("Failed to remove thumb for book %d", book_id)


def get_book(db: sqlite3.Connection, book_id: int, user_id: int) -> BookDetailResponse:
    """Get book with files and identifiers. Raises NotFoundError if book absent."""
    book = dal.get_book_by_id(db, book_id, user_id)
    if not book:
        raise NotFoundError(_BOOK_NOT_FOUND)
    files = dal.get_book_files(db, book_id)
    identifiers = dal.get_book_identifiers(db, book_id)
    return BookDetailResponse(
        book=row_to_book_detail_item(cast(dict, book)),
        files=cast(Any, files),
        identifiers=cast(Any, identifiers),
    )


def get_book_card_item_or_none(db: sqlite3.Connection, book_id: int, user_id: int) -> BookCardItem | None:
    """Return a BookCardItem for book_id/user_id, or None if the book is absent.

    Used by the shelves router to embed the card in the shelfMembershipChanged payload
    after a successful add — avoids a direct DAL import in the router layer.
    """
    row = dal.get_book_by_id(db, book_id, user_id)
    if row is None:
        return None
    # sqlite3.Row is dict-like but not dict; cast satisfies row_to_book_card_item's dict parameter.
    return row_to_book_card_item(cast(dict, row))


def _resolve_add_formats(add_formats: list[str]) -> list[tuple[str, str, str, str]]:
    """Резолвит tempId-ы в (tempId, src_path, fmt, ext). Кидает ошибки до side effects."""
    if len(set(add_formats)) != len(add_formats):
        raise ConflictError("Duplicate tempId in addFormats")
    resolved: list[tuple[str, str, str, str]] = []
    for tid in add_formats:
        basename = find_temp_file(tid)
        if basename is None:
            raise BadInputError(f"Temp file not found: {tid}")
        ext = basename.rsplit(".", 1)[-1].lower()
        fmt = ext.upper()
        src_path = str(UPLOADS_DIR / basename)
        resolved.append((tid, src_path, fmt, ext))
    added_fmts = [r[2] for r in resolved]
    if len(set(added_fmts)) != len(added_fmts):
        raise ConflictError("Duplicate format in addFormats")
    return resolved


def _check_format_collision(
    db: sqlite3.Connection,
    book_id: int,
    resolved_adds: list[tuple[str, str, str, str]],
    delete_formats: list[str],
) -> None:
    """Конфликт: финальный набор форматов не должен содержать дубликатов."""
    existing_fmts = {f["format"] for f in dal.get_book_files(db, book_id)}
    added_set = {r[2] for r in resolved_adds}
    deleted_set = set(delete_formats)
    conflict = added_set & (existing_fmts - deleted_set)
    if conflict:
        raise ConflictError(f"Format {min(conflict)} already present")


def _resolve_delete_formats(
    db: sqlite3.Connection, book_id: int, delete_formats: list[str],
) -> list[tuple[str, BookFileLookup]]:
    """Идемпотентный резолв: пропускает форматы, которых нет (с info-логом)."""
    resolved: list[tuple[str, BookFileLookup]] = []
    for fmt_code in delete_formats:
        row = dal.get_book_file(db, book_id, fmt_code)
        if row is None:
            log.info(
                "idempotent delete skipped: book=%d format=%s not present",
                book_id, safe_log(fmt_code),
            )
            continue
        resolved.append((fmt_code, row))
    return resolved


def _apply_delete_formats(
    db: sqlite3.Connection,
    book_id: int,
    resolved_deletes: list[tuple[str, BookFileLookup]],
) -> list[tuple[str, str]]:
    """Backup-then-delete: FS-файлы → .bak (для возможного restore), DB-row удаляется.

    Возвращает список (original_path, bak_path) для последующего restore/finalize.
    """
    backed_up: list[tuple[str, str]] = []
    for fmt_code, row in resolved_deletes:
        # Defense-in-depth: fmt_code came through DAL-existence filter, но если
        # в book_files.format когда-то проникнет кривое значение (через bug
        # вверх по pipeline), путь поедет за пределы LIBRARY_DIR. Whitelist
        # ловит это до os.rename.
        ext_safe = _safe_ext(fmt_code)
        file_path = assert_within(LIBRARY_DIR, LIBRARY_DIR / str(book_id) / f"book.{ext_safe}")
        if os.path.isfile(file_path):
            bak_path = assert_within(LIBRARY_DIR, f"{file_path}.bak")
            os.rename(file_path, bak_path)
            backed_up.append((file_path, bak_path))
        dal.delete_book_file(db, row["id"])
    return backed_up


def _apply_add_formats(
    db: sqlite3.Connection,
    book_id: int,
    resolved_adds: list[tuple[str, str, str, str]],
    backed_up_paths: list[tuple[str, str]],
) -> None:
    """Copy + register + linearize. При сбое — чистит частично записанные dst и
    восстанавливает .bak из backed_up_paths."""
    copied_dsts: list[str] = []
    try:
        for (_, src, fmt, ext) in resolved_adds:
            dst = prepare_book_format_path(db, book_id, fmt, ext)
            copied_dsts.append(dst)
            shutil.copyfile(src, dst)
            register_and_linearize(db, book_id, dst, ext)
    except Exception:
        for d in copied_dsts:
            with contextlib.suppress(FileNotFoundError):
                os.remove(d)
        for orig_path, bak_path in backed_up_paths:
            safe_orig_path = assert_within(LIBRARY_DIR, orig_path)
            safe_bak_path = assert_within(LIBRARY_DIR, bak_path)
            with contextlib.suppress(FileNotFoundError):
                os.rename(safe_bak_path, safe_orig_path)
        raise


def _resolve_metadata_refs(db: sqlite3.Connection, data: BookUpdateData) -> None:
    """Резолвит author_ids/tag_ids/series_id в БД-id'ы (in-place)."""
    if "author_ids" in data:
        data["author_ids"] = resolve_authors(db, data["author_ids"])  # pyright: ignore[reportGeneralTypeIssues, reportTypedDictNotRequiredAccess]
    if "tag_ids" in data:
        data["tag_ids"] = resolve_tags(db, data["tag_ids"])  # pyright: ignore[reportGeneralTypeIssues, reportTypedDictNotRequiredAccess]
    if "series_id" in data:
        data["series_id"] = resolve_series(db, data["series_id"])  # pyright: ignore[reportGeneralTypeIssues, reportTypedDictNotRequiredAccess]


def _update_book_response(
    db: sqlite3.Connection,
    book_id: int,
    user_id: int,
) -> UpdateBookResponse:
    detail = get_book(db, book_id, user_id)
    return UpdateBookResponse(
        ok=True,
        book=detail.book,
        files=detail.files,
        identifiers=detail.identifiers,
    )


def update_book(
    db: sqlite3.Connection,
    book_id: int,
    body: UpdateBookBody,
    user_id: int = 1,
) -> UpdateBookResponse:
    """Apply full desired state to a book: metadata + files + cover commit.

    Последовательность шагов — spec 2026-04-24-book-format-staging-design.md §5.
    """
    if not dal.book_exists(db, book_id):
        raise NotFoundError(_BOOK_NOT_FOUND)

    data: BookUpdateData = cast(
        BookUpdateData,
        body.model_dump(
            exclude_unset=True,
            exclude={"add_formats", "delete_formats", "commit_cover"},
        ),
    )
    add_formats = body.add_formats or []
    delete_formats = body.delete_formats or []

    # Шаг 0: no-op guard.
    if not data and not add_formats and not delete_formats and not body.commit_cover:
        return _update_book_response(db, book_id, user_id)

    # Шаг 1: валидация и резолвы — до любых side effects.
    current_detail = get_book(db, book_id, user_id)
    resolved_adds = _resolve_add_formats(add_formats)
    _check_format_collision(db, book_id, resolved_adds, delete_formats)
    if body.commit_cover and cover_service._find_temp_cover(book_id) is None:
        raise BadInputError("No pending cover to commit")
    resolved_deletes = _resolve_delete_formats(db, book_id, delete_formats)
    _resolve_metadata_refs(db, data)
    metadata_changed_fields = _metadata_changed_fields(body, data, current_detail)

    # Шаг 2-3: delete (backup-then-delete) → add (copy/register/linearize).
    # При сбое add — restore .bak из шага 2.
    backed_up_paths = _apply_delete_formats(db, book_id, resolved_deletes)
    _apply_add_formats(db, book_id, resolved_adds, backed_up_paths)

    # Шаг 4: commitCover.
    cover_changed = False
    if body.commit_cover:
        cover_changed = cover_service._commit(db, book_id)
    if body.commit_cover and not cover_changed:
        # Pending-cover исчез между check и commit (race с cleanup_old_uploads —
        # grace 3600 s, практически невозможно).
        log.warning(
            "commitCover: pending cover vanished between check and commit, book=%d",
            book_id,
        )

    # Шаг 5: metadata — всегда (updated_at bump при file-only тоже).
    dal.update_book(db, book_id, data)

    # Шаг 5b: финальное удаление backed-up .bak (replace-flow успешно завершён).
    for _, bak_path in backed_up_paths:
        safe_bak_path = assert_within(LIBRARY_DIR, bak_path)
        with contextlib.suppress(FileNotFoundError):
            os.remove(safe_bak_path)

    # Шаг 6: cleanup temp-буфера после успеха.
    for (tid, _, _, _) in resolved_adds:
        cleanup_temp_session(tid)

    response = _update_book_response(db, book_id, user_id)
    changed_fields = _changed_book_fields(
        metadata_changed_fields,
        files_changed=bool(resolved_adds or resolved_deletes),
        cover_changed=cover_changed,
    )
    if changed_fields:
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="library"),
            event_type="bookUpdated",
            payload={
                "book": _library_event_book_payload(response),
                "changedFields": changed_fields,
            },
        )
    return response


def list_books(
    db: sqlite3.Connection,
    user_id: int,
    *,
    sort: str,
    cursor: int,
    page_size: int,
    author_ids: list[int] | None,
    tag_ids: list[int] | None,
    series_ids: list[int] | None,
    language: list[str] | None,
) -> BookListResponse:
    """Paginated catalog listing with user-scoped filters."""
    filters = filters_service.build_catalog_filters(
        author_ids=author_ids,
        tag_ids=tag_ids,
        series_ids=series_ids,
        language=language,
    )
    rows = dal.get_books(
        db,
        user_id=user_id,
        sort=sort,
        cursor=cursor,
        page_size=page_size + 1,
        filters=filters,
    )
    has_more = len(rows) > page_size
    page = rows[:page_size] if has_more else rows
    books = [row_to_book_card_item(cast(dict, r)) for r in page]
    return BookListResponse(books=books, has_more=has_more)
