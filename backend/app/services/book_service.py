import contextlib  # noqa: F401  # staged for Task 4 rollback block
import logging
import os
import shutil
import sqlite3
from typing import cast

from ..config import LIBRARY_DIR, UPLOADS_DIR  # noqa: F401  # UPLOADS_DIR staged for Task 4
from ..dal import books as dal
from ..dtos.books import (  # noqa: F401  # BookFileLookup staged for Task 5 resolved_deletes
    BookDetailResponse, BookFileLookup, BookListPage, BookListResponse, BookUpdateData, UpdateBookBody,
    UploadFileResponse,
)
from ..exceptions import BadInputError, ConflictError, NotFoundError  # noqa: F401  # BadInputError/ConflictError staged for Task 4
from ..fs_utils import write_with_rollback
from . import cover_service, filters_service, thumb  # noqa: F401  # cover_service staged for Task 6
from .book_file_writer import prepare_book_format_path, register_and_linearize
from .entity_resolver import resolve_authors, resolve_series, resolve_tags
from .temp_cleanup import cleanup_temp_session, find_temp_file  # noqa: F401  # staged for Task 4

log = logging.getLogger("librarium.services.books")

_BOOK_NOT_FOUND = "Book not found"


def upload_file(db: sqlite3.Connection, book_id: int, content: bytes, ext: str) -> UploadFileResponse:
    """Write a book file to disk and register in DB.

    Rollback: removes file on DB failure via write_with_rollback.
    """
    fmt = ext.upper()
    dst = prepare_book_format_path(db, book_id, fmt, ext)
    with write_with_rollback(dst, content):
        size = register_and_linearize(db, book_id, dst, ext)
    return UploadFileResponse(ok=True, format=fmt, size=size)


def delete_file(db: sqlite3.Connection, book_id: int, fmt: str) -> None:
    """Delete a book format file. FS first, then DB.

    Intentionally FS-first: if FS fails, DB is untouched and state is consistent.
    DB-first was tried and reverted — it creates false transactional guarantees
    that break down at the DB commit boundary (db_session commits after handler return).
    """
    row = dal.get_book_file(db, book_id, fmt)
    if not row:
        raise NotFoundError("Not found")

    file_path = str(LIBRARY_DIR / str(book_id) / f"book.{fmt.lower()}")
    if os.path.isfile(file_path):
        os.remove(file_path)
    dal.delete_book_file(db, row["id"])


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
            exclude={"addFormats", "deleteFormats", "commitCover"},
        ),
    )

    add_formats = body.addFormats or []
    delete_formats = body.deleteFormats or []

    # Шаг 0: no-op guard
    if not data and not add_formats and not delete_formats and not body.commitCover:
        return

    # Шаги 1–6 — добавляются в Task 4–6.

    if "authorIds" in data:
        data["authorIds"] = resolve_authors(db, data["authorIds"])
    if "tagIds" in data:
        data["tagIds"] = resolve_tags(db, data["tagIds"])
    if "seriesId" in data:
        data["seriesId"] = resolve_series(db, data["seriesId"])

    dal.update_book(db, book_id, data)

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
    page: BookListPage = dal.get_books(db, filters, sort, cursor, page_size)
    return BookListResponse(books=page["books"], hasMore=page["hasMore"])
