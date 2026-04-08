import logging
import os
import sqlite3
import shutil
from fastapi import APIRouter, Depends, Request, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from ..auth import get_current_user, require_admin

log = logging.getLogger("librarium.books")
from ..config import LIBRARY_DIR, DATA_DIR, MAX_BOOK_SIZE, db_path_for
from ..database import db_session
from ..dal import books as dal
from .params import parse_ids
from ..dal.books import get_book_by_id
from ..pdf_linearize import linearize_pdf_in_place

router = APIRouter(prefix="/api/books", tags=["books"])


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
def list_books(request: Request, db: sqlite3.Connection = Depends(db_session), sort: str = "added_desc", cursor: int = 0, pageSize: int = 50,
               authorIds: str = "", tagIds: str = "", seriesIds: str = "", language: str = ""):
    pageSize = min(pageSize, 100)
    user = get_current_user(request)
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
def get_book(book_id: int, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    book = dal.get_book_by_id(db, book_id, user["userId"])
    if not book:
        return JSONResponse({"error": "Not found"}, status_code=404)
    files = dal.get_book_files(db, book_id)
    identifiers = dal.get_book_identifiers(db, book_id)
    return {"book": book, "files": files, "identifiers": identifiers}


@router.put("/{book_id}")
def update_book(book_id: int, body: UpdateBookBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    from ..dal.authors import get_or_create_author
    from ..dal.series import get_or_create_series
    from ..dal.tags import get_or_create_tag
    user = require_admin(request)
    if not dal.book_exists(db, book_id):
        return JSONResponse({"error": "Book not found"}, status_code=404)
    data = body.model_dump(exclude_unset=True)

    # Resolve string names to IDs
    if "authorIds" in data:
        data["authorIds"] = [get_or_create_author(db, a) if isinstance(a, str) else a for a in data["authorIds"]]
    if "tagIds" in data:
        data["tagIds"] = [get_or_create_tag(db, t) if isinstance(t, str) else t for t in data["tagIds"]]
    if "seriesId" in data and isinstance(data["seriesId"], str):
        data["seriesId"] = get_or_create_series(db, data["seriesId"])

    dal.update_book(db, book_id, data)

    log.info("Updated book=%d by user_id=%s", book_id, user["userId"])
    return {"ok": True}


@router.post("/{book_id}/files")
async def upload_file(book_id: int, request: Request, db: sqlite3.Connection = Depends(db_session), file: UploadFile = File(...)):
    user = require_admin(request)
    if not dal.book_exists(db, book_id):
        return JSONResponse({"error": "Book not found"}, status_code=404)
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    allowed = {"fb2", "epub", "pdf"}
    if ext not in allowed:
        return JSONResponse({"error": f"Unsupported format: {ext}"}, status_code=400)
    fmt = ext.upper()
    if dal.book_file_exists(db, book_id, fmt):
        return JSONResponse({"error": f"Формат {fmt} уже есть"}, status_code=409)
    content = await file.read()
    if len(content) > MAX_BOOK_SIZE:
        return JSONResponse({"error": "Файл слишком большой"}, status_code=400)
    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)
    file_path = os.path.join(book_dir, f"book.{ext}")
    with open(file_path, "wb") as f:
        f.write(content)
    if ext == "pdf":
        linearize_pdf_in_place(file_path)
    try:
        dal.add_book_file(db, book_id, fmt, db_path_for(book_id, f"book.{ext}"), os.path.getsize(file_path))
    except Exception:
        os.remove(file_path)
        raise
    log.info("Uploaded file format=%s book=%d by user_id=%s", fmt, book_id, user["userId"])
    return {"ok": True, "format": fmt, "size": len(content)}


@router.delete("/{book_id}/files")
def delete_file(book_id: int, request: Request, db: sqlite3.Connection = Depends(db_session), format: str = ""):
    user = require_admin(request)
    fmt = format.upper()
    if not fmt:
        return JSONResponse({"error": "format required"}, status_code=400)
    row = dal.get_book_file(db, book_id, fmt)
    if not row:
        return JSONResponse({"error": "Not found"}, status_code=404)
    file_path = str(LIBRARY_DIR / str(book_id) / f"book.{fmt.lower()}")
    if os.path.isfile(file_path):
        os.remove(file_path)
    dal.delete_book_file(db, row["id"])
    log.info("Deleted file format=%s book=%d by user_id=%s", fmt, book_id, user["userId"])
    return {"ok": True}


@router.delete("/{book_id}")
def delete_book(book_id: int, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = require_admin(request)
    if not dal.book_exists(db, book_id):
        return JSONResponse({"error": "Book not found"}, status_code=404)

    # Delete files from disk
    book_dir = str(LIBRARY_DIR / str(book_id))
    if os.path.isdir(book_dir):
        shutil.rmtree(book_dir)

    # Delete thumb
    thumb = str(DATA_DIR / "thumbs" / f"{book_id}.jpg")
    if os.path.exists(thumb):
        os.remove(thumb)

    # Delete from DB (CASCADE handles book_authors, book_tags, book_files, etc.)
    dal.delete_book(db, book_id)
    log.info("Deleted book=%d by user_id=%s", book_id, user["userId"])
    return {"ok": True}
