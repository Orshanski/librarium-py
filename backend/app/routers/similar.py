import sqlite3
from fastapi import APIRouter, Depends
from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.similar import SimilarResponse
from ..services import similar_service

router = APIRouter(tags=["similar"])


@router.get("/api/books/{book_id}/similar", response_model=SimilarResponse)
def get_similar(
    book_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
):
    return similar_service.get_similar(db, book_id)
