import os
import sqlite3
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from ..auth import get_current_user
from ..config import LIBRARY_DIR
from ..database import db_session
from ..dal.books import get_book_by_id, get_book_files

router = APIRouter(tags=["download"])


@router.get("/api/books/{book_id}/download")
def download_book(book_id: int, format: str, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    book = get_book_by_id(db, book_id)
    if not book:
        raise HTTPException(404, detail="Book not found")

    files = get_book_files(db, book_id)
    target = next((f for f in files if f["format"].upper() == format.upper()), None)
    if not target:
        raise HTTPException(404, detail="Format not available")

    file_path = os.path.realpath(os.path.join(str(LIBRARY_DIR), str(book_id), f"book.{format.lower()}"))
    if not file_path.startswith(str(LIBRARY_DIR.resolve())) or not os.path.isfile(file_path):
        raise HTTPException(404, detail="File not found")

    filename = f"{book['title']}.{format.lower()}"
    return FileResponse(file_path, filename=filename, media_type="application/octet-stream")
