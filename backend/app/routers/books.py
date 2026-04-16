import logging
import sqlite3

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..auth import get_current_user, require_admin
from ..config import MAX_BOOK_SIZE
from ..dal import books as dal
from ..database import db_session
from ..services import book_service
from ..services.entity_resolver import resolve_authors, resolve_tags, resolve_series
from .params import parse_ids

log = logging.getLogger("librarium.books")

router = APIRouter(prefix="/api/books", tags=["books"])

ALLOWED_FORMATS = {"fb2", "epub", "pdf"}


class UpdateBookBody(BaseModel):
    title: str | None = None
    description: str | None = None
    language: str | None = None
    publisher: str | None = None
    pubDate: str | None = None
    seriesId: int | str | None = None
    seriesNumber: float | None = None
    authorIds: list[int | str] | None = None
    tagIds: list[int | str] | None = None
    isbn: str | None = None


@router.get("")
def list_books(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), sort: str = "added_desc", cursor: int = 0, pageSize: int = 50,
               authorIds: str = "", tagIds: str = "", seriesIds: str = "", language: str = ""):
    pageSize = min(pageSize, 100)
    filters: dict = {"userId": user["userId"]}
    if ids := parse_ids(authorIds):
        filters["authorIds"] = ids
    if ids := parse_ids(tagIds):
        filters["tagIds"] = ids
    if ids := parse_ids(seriesIds):
        filters["seriesIds"] = ids
    if language:
        filters["language"] = language
    return dal.get_books(db, filters, sort, cursor, pageSize)


@router.get("/{book_id}")
def get_book(book_id: int, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    book = dal.get_book_by_id(db, book_id, user["userId"])
    if not book:
        return JSONResponse({"error": "Not found"}, status_code=404)
    files = dal.get_book_files(db, book_id)
    identifiers = dal.get_book_identifiers(db, book_id)
    return {"book": book, "files": files, "identifiers": identifiers}


@router.put("/{book_id}")
def update_book(book_id: int, body: UpdateBookBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    if not dal.book_exists(db, book_id):
        return JSONResponse({"error": "Book not found"}, status_code=404)
    data = body.model_dump(exclude_unset=True)

    if "authorIds" in data:
        data["authorIds"] = resolve_authors(db, data["authorIds"])
    if "tagIds" in data:
        data["tagIds"] = resolve_tags(db, data["tagIds"])
    if "seriesId" in data:
        data["seriesId"] = resolve_series(db, data["seriesId"])

    dal.update_book(db, book_id, data)
    log.info("Updated book=%d by user_id=%s", book_id, user["userId"])
    return {"ok": True}


@router.post("/{book_id}/files")
async def upload_file(book_id: int, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session), file: UploadFile = File(...)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_FORMATS:
        return JSONResponse({"error": f"Unsupported format: {ext}"}, status_code=400)
    content = await file.read()
    if len(content) > MAX_BOOK_SIZE:
        return JSONResponse({"error": "Файл слишком большой"}, status_code=400)

    try:
        result = book_service.upload_file(db, book_id, content, ext)
    except LookupError as e:
        return JSONResponse({"error": str(e)}, status_code=404)
    except FileExistsError as e:
        return JSONResponse({"error": str(e)}, status_code=409)

    log.info("Uploaded file format=%s book=%d by user_id=%s", result["format"], book_id, user["userId"])
    return {"ok": True, "format": result["format"], "size": result["size"]}


@router.delete("/{book_id}/files")
def delete_file(book_id: int, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session), format: str = ""):
    fmt = format.upper()
    if not fmt:
        return JSONResponse({"error": "format required"}, status_code=400)

    try:
        book_service.delete_file(db, book_id, fmt)
    except LookupError as e:
        return JSONResponse({"error": str(e)}, status_code=404)

    log.info("Deleted file format=%s book=%d by user_id=%s", fmt, book_id, user["userId"])
    return {"ok": True}


@router.delete("/{book_id}")
def delete_book(book_id: int, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    try:
        book_service.delete_book(db, book_id)
    except LookupError as e:
        return JSONResponse({"error": str(e)}, status_code=404)

    log.info("Deleted book=%d by user_id=%s", book_id, user["userId"])
    return {"ok": True}
