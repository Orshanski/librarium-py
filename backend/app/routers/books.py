import logging
import sqlite3

from fastapi import APIRouter, Depends, File, Query, UploadFile

from ..auth import CurrentUser, get_current_user, require_admin
from ..config import MAX_BOOK_SIZE
from ..database import db_session
from ..dtos.books import UpdateBookBody
from ..exceptions import BadInputError
from ..services import book_service
from ..services.upload_service import BOOK_EXTENSIONS
from ._validators import NonBlankStr
from .params import parse_ids

log = logging.getLogger("librarium.books")

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("")
def list_books(
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    sort: str = "added_desc",
    cursor: int = 0,
    pageSize: int = 50,
    authorIds: str = "",
    tagIds: str = "",
    seriesIds: str = "",
    language: str = "",
):
    return book_service.list_books(
        db,
        user.user_id,
        sort=sort,
        cursor=cursor,
        page_size=min(pageSize, 100),
        author_ids=parse_ids(authorIds),
        tag_ids=parse_ids(tagIds),
        series_ids=parse_ids(seriesIds),
        language=language or None,
    )


@router.get("/{book_id}")
def get_book(book_id: int, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    return book_service.get_book(db, book_id, user.user_id)


@router.put("/{book_id}")
def update_book(
    book_id: int,
    body: UpdateBookBody,
    user: CurrentUser = Depends(require_admin),
    db: sqlite3.Connection = Depends(db_session),
):
    book_service.update_book(db, book_id, body)
    log.info("Updated book=%d by user_id=%s", book_id, user.user_id)
    return {"ok": True}


@router.post("/{book_id}/files")
async def upload_file(
    book_id: int,
    user: CurrentUser = Depends(require_admin),
    db: sqlite3.Connection = Depends(db_session),
    file: UploadFile = File(...),
):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in BOOK_EXTENSIONS:
        raise BadInputError(f"Unsupported format: {ext}")
    content = await file.read()
    if len(content) > MAX_BOOK_SIZE:
        raise BadInputError("Файл слишком большой")

    result = book_service.upload_file(db, book_id, content, ext)

    log.info("Uploaded file format=%s book=%d by user_id=%s", result["format"], book_id, user.user_id)
    return {"ok": True, "format": result["format"], "size": result["size"]}


@router.delete("/{book_id}/files")
def delete_file(
    book_id: int,
    user: CurrentUser = Depends(require_admin),
    db: sqlite3.Connection = Depends(db_session),
    format: NonBlankStr = Query(...),
):
    fmt = format.upper()
    book_service.delete_file(db, book_id, fmt)
    log.info("Deleted file format=%s book=%d by user_id=%s", fmt, book_id, user.user_id)
    return {"ok": True}


@router.delete("/{book_id}")
def delete_book(book_id: int, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    book_service.delete_book(db, book_id)
    log.info("Deleted book=%d by user_id=%s", book_id, user.user_id)
    return {"ok": True}
