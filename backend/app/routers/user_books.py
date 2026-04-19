import sqlite3
from fastapi import APIRouter, Depends
from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos import OkResponse
from ..dtos.user_books import RatingBody, ReadBody, HiddenBody
from ..services import user_books_service

router = APIRouter(tags=["user-books"])


@router.put("/api/books/{book_id}/rating", response_model=OkResponse)
def set_rating(book_id: int, body: RatingBody, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    user_books_service.set_rating(db, user.user_id, book_id, body.rating)
    return OkResponse()


@router.put("/api/books/{book_id}/read", response_model=OkResponse)
def set_read(book_id: int, body: ReadBody, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    user_books_service.set_read(db, user.user_id, book_id, body.isRead)
    return OkResponse()


@router.put("/api/books/{book_id}/hidden", response_model=OkResponse)
def set_hidden(book_id: int, body: HiddenBody, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    user_books_service.set_hidden(db, user.user_id, book_id, body.isHidden)
    return OkResponse()
