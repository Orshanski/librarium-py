from typing import Annotated
import sqlite3
from fastapi import APIRouter, Depends
from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ._file_responses import book_file_response

router = APIRouter(tags=["download"])


@router.get("/api/books/{book_id}/download")
def download_book(
    book_id: int,
    format: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
):
    return book_file_response(db, book_id, format)
