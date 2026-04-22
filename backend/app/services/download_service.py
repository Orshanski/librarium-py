"""Book file download — resolve path with traversal guard."""
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from ..config import DB_PATH_PREFIX, LIBRARY_DIR
from ..dal import books as dal
from ..exceptions import NotFoundError

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

    # file_path в DB — путь вида "data/library/{book_id}/{filename}"
    # (см. config.db_path_for). Берём часть внутри library и склеиваем с
    # LIBRARY_DIR — так путь работает одинаково в prod и в тестах, где
    # DATA_DIR смонтирован под другим именем.
    try:
        rel_in_library = Path(target["file_path"]).relative_to(DB_PATH_PREFIX)
    except ValueError:
        raise NotFoundError(_FILE_NOT_FOUND)
    candidate = LIBRARY_DIR / rel_in_library

    try:
        resolved = candidate.resolve()
        resolved.relative_to(LIBRARY_DIR.resolve())
    except (ValueError, OSError):
        raise NotFoundError(_FILE_NOT_FOUND)
    if not resolved.is_file():
        raise NotFoundError(_FILE_NOT_FOUND)

    return DownloadTarget(
        path=str(resolved),
        filename=f"{book['title']}.{fmt.lower()}",
        media_type="application/octet-stream",
    )
