import sqlite3
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from ..auth import get_current_user
from ..database import db_session
from ..dal import user_books as dal

router = APIRouter(tags=["user-books"])


class RatingBody(BaseModel):
    rating: int | None = Field(None, ge=1, le=5)


class ReadBody(BaseModel):
    isRead: bool


class HiddenBody(BaseModel):
    isHidden: bool


@router.put("/api/books/{book_id}/rating")
def set_rating(book_id: int, body: RatingBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    dal.set_rating(db, user["userId"], book_id, body.rating)
    return {"ok": True}


@router.put("/api/books/{book_id}/read")
def set_read(book_id: int, body: ReadBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    dal.set_read(db, user["userId"], book_id, body.isRead)
    return {"ok": True}


@router.put("/api/books/{book_id}/hidden")
def set_hidden(book_id: int, body: HiddenBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    dal.set_hidden(db, user["userId"], book_id, body.isHidden)
    return {"ok": True}
