"""Book file download — resolve path with traversal guard."""
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from ..config import LIBRARY_DIR
from ..dal import books as dal
from ..exceptions import NotFoundError


@dataclass
class DownloadTarget:
    path: str
    filename: str
    media_type: str


def resolve_download(db: sqlite3.Connection, book_id: int, fmt: str) -> DownloadTarget:
    """Resolve file path for book download.

    Args:
        fmt: Format code (case-insensitive, e.g. "epub", "fb2", "pdf").
            Must match a format recorded in the book_files table.

    Raises:
        NotFoundError: if the book, format, or file is missing, or if the
        resolved path escapes LIBRARY_DIR (traversal guard).
    """
    book = dal.get_book_by_id(db, book_id)
    if not book:
        raise NotFoundError("Book not found")

    files = dal.get_book_files(db, book_id)
    target = next((f for f in files if f["format"].upper() == fmt.upper()), None)
    if not target:
        raise NotFoundError("Format not available")

    candidate = Path(LIBRARY_DIR, str(book_id), f"book.{fmt.lower()}")
    try:
        resolved = candidate.resolve()
        resolved.relative_to(LIBRARY_DIR.resolve())
    except (ValueError, OSError):
        raise NotFoundError("File not found")
    if not resolved.is_file():
        raise NotFoundError("File not found")
    file_path = str(resolved)

    return DownloadTarget(
        path=file_path,
        filename=f"{book['title']}.{fmt.lower()}",
        media_type="application/octet-stream",
    )
