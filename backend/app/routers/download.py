import os
import sqlite3

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from ..auth import get_current_user
from ..config import LIBRARY_DIR
from ..dal.books import get_book_by_id, get_book_files
from ..database import db_session
from ..exceptions import NotFoundError

router = APIRouter(tags=["download"])


@router.get("/api/books/{book_id}/download")
def download_book(
    book_id: int,
    format: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
):
    book = get_book_by_id(db, book_id)
    if not book:
        raise NotFoundError("Book not found")

    files = get_book_files(db, book_id)
    target = next((f for f in files if f["format"].upper() == format.upper()), None)
    if not target:
        raise NotFoundError("Format not available")

    file_path = os.path.realpath(os.path.join(str(LIBRARY_DIR), str(book_id), f"book.{format.lower()}"))
    if not file_path.startswith(str(LIBRARY_DIR.resolve())) or not os.path.isfile(file_path):
        raise NotFoundError("File not found")

    filename = f"{book['title']}.{format.lower()}"
    return FileResponse(file_path, filename=filename, media_type="application/octet-stream")
