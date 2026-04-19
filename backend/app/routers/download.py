import sqlite3
from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..services import download_service

router = APIRouter(tags=["download"])


@router.get("/api/books/{book_id}/download")
def download_book(
    book_id: int,
    format: str,
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
):
    target = download_service.resolve_download(db, book_id, format)
    return FileResponse(target.path, filename=target.filename, media_type=target.media_type)
