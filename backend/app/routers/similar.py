import sqlite3
from fastapi import APIRouter, Depends
from ..auth import get_current_user
from ..database import db_session
from ..services import similar_service

router = APIRouter(tags=["similar"])


@router.get("/api/books/{book_id}/similar")
def get_similar(
    book_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
):
    return similar_service.get_similar(db, book_id)
