import contextlib
import logging
import os
import shutil
import sqlite3
from typing import cast

from ..config import LIBRARY_DIR, UPLOADS_DIR
from ..dal import books as dal
from ..dtos.books import (
    BookDetailResponse, BookFileLookup, BookListResponse, BookUpdateData, UpdateBookBody,
)
from ..exceptions import BadInputError, ConflictError, NotFoundError
from . import cover_service, filters_service, thumb
from .book_file_writer import prepare_book_format_path, register_and_linearize
from .entity_resolver import resolve_authors, resolve_series, resolve_tags
from .temp_cleanup import cleanup_temp_session, find_temp_file

log = logging.getLogger("librarium.services.books")

_BOOK_NOT_FOUND = "Book not found"


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
    return BookDetailResponse(book=book, files=files, identifiers=identifiers)


def update_book(db: sqlite3.Connection, book_id: int, body: UpdateBookBody) -> None:
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

    # Шаг 0: no-op guard
    if not data and not add_formats and not delete_formats and not body.commit_cover:
        return

    # Шаг 1: валидация (rollback-дешёвая, до side effects)

    # 1a. Duplicate tempId → 409.
    if len(set(add_formats)) != len(add_formats):
        raise ConflictError("Duplicate tempId in addFormats")

    # 1b. Резолв tempId → (src_path, fmt, ext).
    resolved_adds: list[tuple[str, str, str, str]] = []  # (tempId, src_path, fmt, ext)
    for tid in add_formats:
        basename = find_temp_file(tid)
        if basename is None:
            raise BadInputError(f"Temp file not found: {tid}")
        ext = basename.rsplit(".", 1)[-1].lower()
        fmt = ext.upper()
        src_path = str(UPLOADS_DIR / basename)
        resolved_adds.append((tid, src_path, fmt, ext))

    # 1c. Duplicate format в addFormats после резолва → 409.
    added_fmts = [r[2] for r in resolved_adds]
    if len(set(added_fmts)) != len(added_fmts):
        raise ConflictError("Duplicate format in addFormats")

    # 1d. Early conflict check: итоговый набор форматов не должен иметь дубликатов.
    existing_fmts = {f["format"] for f in dal.get_book_files(db, book_id)}
    deleted_set = set(delete_formats)
    added_set = set(added_fmts)
    conflict = added_set & (existing_fmts - deleted_set)
    if conflict:
        raise ConflictError(f"Format {sorted(conflict)[0]} already present")

    # 1e. commitCover pending-check.
    if body.commit_cover and cover_service._find_temp_cover(book_id) is None:
        raise BadInputError("No pending cover to commit")

    # 1f. Резолв deleteFormats → идемпотентный список (format, row) + skipped.
    resolved_deletes: list[tuple[str, BookFileLookup]] = []  # (format, row)
    for fmt_code in delete_formats:
        row = dal.get_book_file(db, book_id, fmt_code)
        if row is None:
            log.info(
                "idempotent delete skipped: book=%d format=%s not present",
                book_id, fmt_code,
            )
            continue
        resolved_deletes.append((fmt_code, row))

    # Шаг 2: apply deleteFormats — backup-then-delete pattern.
    # FS-файлы переименовываются в `.bak`, чтобы при сбое шага 3 их можно
    # было восстановить. После успеха шага 5 — `.bak` удаляются финально.
    # Симметрично cover_service._backup_existing/_restore_from_backup.
    backed_up_paths: list[tuple[str, str]] = []  # (original_path, bak_path)
    for fmt_code, row in resolved_deletes:
        file_path = str(LIBRARY_DIR / str(book_id) / f"book.{fmt_code.lower()}")
        if os.path.isfile(file_path):
            bak_path = file_path + ".bak"
            os.rename(file_path, bak_path)
            backed_up_paths.append((file_path, bak_path))
        dal.delete_book_file(db, row["id"])

    # Шаг 3: apply addFormats (copyfile + register + manual rollback).
    # Note: `copied_dsts.append(dst)` идёт ДО `shutil.copyfile` — чтобы
    # частично записанный dst при сбое copyfile тоже попал в cleanup.
    copied_dsts: list[str] = []
    try:
        for (_tid, src, fmt, ext) in resolved_adds:
            dst = prepare_book_format_path(db, book_id, fmt, ext)
            copied_dsts.append(dst)
            shutil.copyfile(src, dst)
            register_and_linearize(db, book_id, dst, ext)
    except Exception:
        # Cleanup новых dst — частично/полностью скопированных.
        for d in copied_dsts:
            with contextlib.suppress(FileNotFoundError):
                os.remove(d)
        # Restore — вернуть переименованные .bak обратно (replace-flow).
        # DB-rollback восстановит book_files rows, файлы должны соответствовать.
        for orig_path, bak_path in backed_up_paths:
            with contextlib.suppress(FileNotFoundError):
                os.rename(bak_path, orig_path)
        raise

    # Шаг 4: apply commitCover.
    if body.commit_cover:
        if not cover_service._commit(db, book_id):
            # Pending-cover был в шаге 1e, но исчез между check и commit (race с
            # `cleanup_old_uploads` — grace 3600 s, практически невозможно).
            log.warning(
                "commitCover: pending cover vanished between check and commit, book=%d",
                book_id,
            )

    # Шаг 5: apply metadata (всегда — updated_at bump при file-only тоже).
    if "author_ids" in data:
        data["author_ids"] = resolve_authors(db, data["author_ids"])
    if "tag_ids" in data:
        data["tag_ids"] = resolve_tags(db, data["tag_ids"])
    if "series_id" in data:
        data["series_id"] = resolve_series(db, data["series_id"])
    dal.update_book(db, book_id, data)

    # Шаг 5b: финальное удаление backed-up `.bak` (replace-flow успешно завершён).
    for _orig_path, bak_path in backed_up_paths:
        with contextlib.suppress(FileNotFoundError):
            os.remove(bak_path)

    # Шаг 6: cleanup temp-буфера после успеха.
    for (tid, _src, _fmt, _ext) in resolved_adds:
        cleanup_temp_session(tid)

    # Шаг 7: SSE publish hook (будущее в `ewg0`).
    # TODO(ewg0): publish event здесь; wrap в try/except в ewg0-impl чтобы сбой не ломал уже успешный Save.


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
        user_id,
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
    books = rows[:page_size] if has_more else rows
    return BookListResponse(books=books, has_more=has_more)
