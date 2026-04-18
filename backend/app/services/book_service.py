import logging
import os
import shutil
import sqlite3
from typing import TypedDict

from ..config import LIBRARY_DIR, db_path_for
from ..dal import books as dal
from ..exceptions import ConflictError, NotFoundError
from . import thumb
from .upload_service import maybe_linearize

log = logging.getLogger("librarium.books")


class UploadResult(TypedDict):
    format: str
    size: int


def upload_file(db: sqlite3.Connection, book_id: int, content: bytes, ext: str) -> UploadResult:
    """Write a book file to disk and register in DB.

    Rollback: removes file on DB failure.
    """
    fmt = ext.upper()

    if not dal.book_exists(db, book_id):
        raise NotFoundError("Book not found")
    if dal.book_file_exists(db, book_id, fmt):
        raise ConflictError(f"Формат {fmt} уже есть")

    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)
    file_path = os.path.join(book_dir, f"book.{ext}")

    with open(file_path, "wb") as f:
        f.write(content)

    maybe_linearize(file_path, ext)

    try:
        file_size = os.path.getsize(file_path)
        dal.add_book_file(db, book_id, fmt, db_path_for(book_id, f"book.{ext}"), file_size)
    except Exception:
        os.remove(file_path)
        raise

    return {"format": fmt, "size": file_size}


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
        raise NotFoundError("Book not found")

    book_dir = str(LIBRARY_DIR / str(book_id))
    if os.path.isdir(book_dir):
        shutil.rmtree(book_dir)

    dal.delete_book(db, book_id)

    # Thumb is cache — best-effort, after the critical path
    try:
        thumb.invalidate(book_id)
    except OSError:
        log.warning("Failed to remove thumb for book %d", book_id)
