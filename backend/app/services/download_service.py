"""Book file download — resolve path with traversal guard."""
import os
import sqlite3
from dataclasses import dataclass

from ..config import LIBRARY_DIR
from ..dal import books as dal
from ..exceptions import NotFoundError


@dataclass
class DownloadTarget:
    path: str
    filename: str
    media_type: str


def resolve_download(db: sqlite3.Connection, book_id: int, fmt: str) -> DownloadTarget:
    """Resolve file path for book download. Raises NotFoundError on any failure.

    Traversal guard: realpath must remain inside LIBRARY_DIR after resolution.
    """
    book = dal.get_book_by_id(db, book_id)
    if not book:
        raise NotFoundError("Book not found")

    files = dal.get_book_files(db, book_id)
    target = next((f for f in files if f["format"].upper() == fmt.upper()), None)
    if not target:
        raise NotFoundError("Format not available")

    file_path = os.path.realpath(
        os.path.join(str(LIBRARY_DIR), str(book_id), f"book.{fmt.lower()}")
    )
    if not file_path.startswith(str(LIBRARY_DIR.resolve())) or not os.path.isfile(file_path):
        raise NotFoundError("File not found")

    return DownloadTarget(
        path=file_path,
        filename=f"{book['title']}.{fmt.lower()}",
        media_type="application/octet-stream",
    )
