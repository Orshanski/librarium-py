from typing import Annotated
import logging
import sqlite3

from fastapi import APIRouter, Depends, File, Query, UploadFile

from ..auth import CurrentUser, get_current_user, require_admin
from ..config import MAX_BOOK_SIZE
from ..database import db_session
from ..dtos import OkResponse
from ..dtos.books import BookDetailResponse, BookListResponse, UpdateBookBody, UploadFileResponse
from ..dtos.catalog import UserSort
from ..exceptions import BadInputError
from ..services import book_service
from ..services.upload_service import BOOK_EXTENSIONS
from ._validators import NonBlankStr

log = logging.getLogger("librarium.books")

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("", response_model=BookListResponse)
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


@router.get("/{book_id}", response_model=BookDetailResponse)
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


@router.post("/{book_id}/files", response_model=UploadFileResponse)
async def upload_file(
    book_id: int,
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    file: Annotated[UploadFile, File()],
):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in BOOK_EXTENSIONS:
        raise BadInputError(f"Unsupported format: {ext}")
    content = await file.read()
    if len(content) > MAX_BOOK_SIZE:
        raise BadInputError("Файл слишком большой")

    result = book_service.upload_file(db, book_id, content, ext)

    log.info("Uploaded file format=%s book=%d by user_id=%s", result.format, book_id, user.user_id)
    return result


@router.delete("/{book_id}/files", response_model=OkResponse)
def delete_file(
    book_id: int,
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    format: Annotated[NonBlankStr, Query()],
):
    fmt = format.upper()
    book_service.delete_file(db, book_id, fmt)
    log.info("Deleted file format=%s book=%d by user_id=%s", fmt, book_id, user.user_id)
    return OkResponse()


@router.delete("/{book_id}", response_model=OkResponse)
def delete_book(book_id: int, user: Annotated[CurrentUser, Depends(require_admin)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    book_service.delete_book(db, book_id)
    log.info("Deleted book=%d by user_id=%s", book_id, user.user_id)
    return OkResponse()
