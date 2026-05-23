"""Book file download — resolve path with traversal guard."""
import sqlite3
from dataclasses import dataclass

from .. import storage_paths
from ..dal import books as dal
from ..exceptions import BadInputError, NotFoundError

_FILE_NOT_FOUND = "File not found"


@dataclass
class DownloadTarget:
    path: str
    filename: str
    media_type: str


def resolve_download(db: sqlite3.Connection, book_id: int, fmt: str) -> DownloadTarget:
    """Resolve file path for book download.

    Использует `file_path` из `book_files` DAL row как source-of-truth — DB
    знает настоящий путь. Раньше сервис перестраивал путь по convention
    `LIBRARY_DIR/book_id/book.ext`, что даёт 404, если file_path в DB хоть
    чуть-чуть расходится с конвенцией.

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

    target_format = target["format"].lower()
    if target_format not in storage_paths.BOOK_EXTS:
        raise NotFoundError(_FILE_NOT_FOUND)

    try:
        resolved = storage_paths.library_file_from_db_path(
            book_id, target["file_path"], {target_format}
        )
    except (BadInputError, OSError):
        raise NotFoundError(_FILE_NOT_FOUND)
    if not resolved.is_file():
        raise NotFoundError(_FILE_NOT_FOUND)

    return DownloadTarget(
        path=str(resolved),
        filename=f"{book['title']}.{fmt.lower()}",
        media_type="application/octet-stream",
    )
