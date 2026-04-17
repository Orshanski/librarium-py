import logging
import os
import re
import sqlite3

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_admin
from ..config import UPLOADS_DIR, MAX_BOOK_SIZE
from ..database import db_session
from ..services.upload_service import (
    upload_and_parse, create_book, add_format,
    find_temp_file, find_temp_covers, BOOK_EXTENSIONS,
)

log = logging.getLogger("librarium.upload")

router = APIRouter(tags=["upload"])


class CreateBookMetadata(BaseModel):
    title: str
    authors: str = ""
    series: str = ""
    seriesNumber: str = ""
    description: str = ""
    language: str = ""
    tags: str = ""
    publisher: str = ""
    pubDate: str = ""
    isbn: str = ""
    coverUrl: str | None = None


class CreateBookBody(BaseModel):
    tempId: str = Field(min_length=1, max_length=20, pattern=r'^[a-zA-Z0-9]+$')
    metadata: CreateBookMetadata = Field(default_factory=CreateBookMetadata)


class AddFormatBody(BaseModel):
    tempId: str = Field(min_length=1, max_length=20, pattern=r'^[a-zA-Z0-9]+$')


def _validate_temp_id(temp_id: str) -> bool:
    return bool(re.match(r'^[a-zA-Z0-9]{1,20}$', temp_id))


@router.post("/api/upload")
async def upload_file(user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session), file: UploadFile = File(...)):
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in BOOK_EXTENSIONS and ext != "zip":
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    # Check size before reading into memory
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_BOOK_SIZE:
        raise HTTPException(status_code=400, detail=f"Файл слишком большой (макс. {MAX_BOOK_SIZE // 1024 // 1024} МБ)")

    content = await file.read()

    try:
        result = await upload_and_parse(db, content, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    log.info("Uploaded temp_id=%s file=%s by user_id=%s", result["tempId"], filename, user["userId"])
    return result


@router.delete("/api/uploads/{temp_id}")
def cleanup_temp(temp_id: str, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    if not _validate_temp_id(temp_id):
        raise HTTPException(status_code=400, detail="Invalid temp_id")
    book_file = find_temp_file(temp_id)
    if book_file:
        os.remove(str(UPLOADS_DIR / book_file))
    for f in find_temp_covers(temp_id):
        os.remove(str(UPLOADS_DIR / f))
    return {"ok": True}


@router.post("/api/books/create")
def create_book_from_upload(body: CreateBookBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    try:
        book_id = create_book(db, body.tempId, body.metadata.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    log.info("Created book=%d by user_id=%s", book_id, user["userId"])
    return {"bookId": book_id}


@router.post("/api/books/{book_id}/add-format")
def add_format_endpoint(book_id: int, body: AddFormatBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    try:
        fmt = add_format(db, book_id, body.tempId)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))

    log.info("Added format=%s book=%d by user_id=%s", fmt, book_id, user["userId"])
    return {"ok": True, "format": fmt}
