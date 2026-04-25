from typing import Annotated
import logging
import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user, require_admin
from ..database import db_session
from ..dtos import OkResponse
from ..dtos.books import BookDetailResponse, BookListResponse, UpdateBookBody
from ..dtos.catalog import UserSort
from ..services import book_service

log = logging.getLogger("librarium.books")

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("", response_model=BookListResponse)  # no exclude_none: optional fields are nullable DB columns always present in rows
def list_books(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    sort: UserSort = "addedDesc",
    cursor: int = 0,
    pageSize: int = 50,
    authorIds: Annotated[list[int] | None, Query()] = None,
    tagIds: Annotated[list[int] | None, Query()] = None,
    seriesIds: Annotated[list[int] | None, Query()] = None,
    language: Annotated[list[str] | None, Query()] = None,
):
    return book_service.list_books(
        db,
        user.user_id,
        sort=sort,
        cursor=cursor,
        page_size=min(pageSize, 100),
        author_ids=authorIds,
        tag_ids=tagIds,
        series_ids=seriesIds,
        language=language,
    )


@router.get("/{book_id}", response_model=BookDetailResponse)  # no exclude_none: optional fields are nullable DB columns always present in rows
def get_book(book_id: int, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    return book_service.get_book(db, book_id, user.user_id)


@router.put("/{book_id}", response_model=OkResponse)
def update_book(
    book_id: int,
    body: UpdateBookBody,
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
):
    book_service.update_book(db, book_id, body)
    log.info("Updated book=%d by user_id=%s", book_id, user.user_id)
    return OkResponse()


@router.delete("/{book_id}", response_model=OkResponse)
def delete_book(book_id: int, user: Annotated[CurrentUser, Depends(require_admin)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    book_service.delete_book(db, book_id)
    log.info("Deleted book=%d by user_id=%s", book_id, user.user_id)
    return OkResponse()
