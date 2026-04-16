import logging
import os
import shutil
import sqlite3

from ..config import LIBRARY_DIR, db_path_for
from ..dal import books as dal
from ..pdf_linearize import linearize_pdf_in_place
from . import thumb

log = logging.getLogger("librarium.books")


def _maybe_linearize(path: str, ext: str) -> None:
    if ext == "pdf":
        linearize_pdf_in_place(path)


def upload_file(db: sqlite3.Connection, book_id: int, content: bytes, ext: str) -> dict:
    """Write a book file to disk and register in DB.

    Returns {"format": str, "size": int}.
    Rollback: removes file on DB failure.
    """
    fmt = ext.upper()

    if not dal.book_exists(db, book_id):
        raise LookupError("Book not found")
    if dal.book_file_exists(db, book_id, fmt):
        raise FileExistsError(f"Формат {fmt} уже есть")

    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)
    file_path = os.path.join(book_dir, f"book.{ext}")

    with open(file_path, "wb") as f:
        f.write(content)

    _maybe_linearize(file_path, ext)

    try:
        dal.add_book_file(db, book_id, fmt, db_path_for(book_id, f"book.{ext}"), os.path.getsize(file_path))
    except Exception:
        os.remove(file_path)
        raise

    return {"format": fmt, "size": len(content)}


def delete_file(db: sqlite3.Connection, book_id: int, fmt: str) -> None:
    """Delete a book format file from disk and DB."""
    row = dal.get_book_file(db, book_id, fmt)
    if not row:
        raise LookupError("Not found")

    file_path = str(LIBRARY_DIR / str(book_id) / f"book.{fmt.lower()}")
    if os.path.isfile(file_path):
        os.remove(file_path)
    dal.delete_book_file(db, row["id"])


def delete_book(db: sqlite3.Connection, book_id: int) -> None:
    """Delete book: DB first (CASCADE), then FS cleanup (best-effort).

    DB first policy: if FS cleanup fails after DB delete, book is gone from DB
    and orphan files don't block the user. Reverse order risks losing files
    if DB delete fails.
    """
    if not dal.book_exists(db, book_id):
        raise LookupError("Book not found")

    # DB first
    dal.delete_book(db, book_id)

    # FS cleanup (best-effort)
    book_dir = str(LIBRARY_DIR / str(book_id))
    try:
        if os.path.isdir(book_dir):
            shutil.rmtree(book_dir)
    except OSError:
        log.warning("Failed to remove book dir %s after DB delete", book_dir)

    try:
        thumb.invalidate(book_id)
    except OSError:
        log.warning("Failed to remove thumb for book %d after DB delete", book_id)
