from typing import Annotated
import sqlite3
from fastapi import APIRouter, Depends
from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos import OkResponse
from ..dtos.user_books import RatingBody, ReadBody, HiddenBody
from ..events import EventScope, publish_domain_event_after_commit
from ..services import user_books_service

router = APIRouter(tags=["user-books"])


@router.put("/api/books/{book_id}/rating", response_model=OkResponse)
def set_rating(book_id: int, body: RatingBody, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    changed = user_books_service.set_rating_changed(db, user.user_id, book_id, body.rating)
    if changed:
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="user", user_id=user.user_id),
            event_type="bookRatingChanged",
            payload={"bookId": book_id, "rating": body.rating},
        )
    return OkResponse()


@router.put("/api/books/{book_id}/read", response_model=OkResponse)
def set_read(book_id: int, body: ReadBody, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    changed = user_books_service.set_read_changed(db, user.user_id, book_id, body.isRead)
    if changed:
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="user", user_id=user.user_id),
            event_type="bookReadChanged",
            payload={"bookId": book_id, "isRead": body.isRead},
        )
    return OkResponse()


@router.put("/api/books/{book_id}/hidden", response_model=OkResponse)
def set_hidden(book_id: int, body: HiddenBody, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    changed = user_books_service.set_hidden_changed(db, user.user_id, book_id, body.isHidden)
    if changed:
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="user", user_id=user.user_id),
            event_type="bookHiddenChanged",
            payload={"bookId": book_id, "isHidden": body.isHidden},
        )
    return OkResponse()
