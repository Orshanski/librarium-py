from typing import Annotated
import logging
import sqlite3

from fastapi import APIRouter, Depends, File, UploadFile

from ..auth import CurrentUser, require_admin
from ..config import MAX_BOOK_SIZE
from ..database import db_session
from ..dtos import OkResponse
from ..dtos.upload import AddFormatResponse, CreateBookBody, CreateBookResponse, AddFormatBody, UploadParseResponse
from ..events import EventScope, publish_domain_event_after_commit
from ..exceptions import BadInputError
from ..logging_utils import safe as safe_log
from ..services.temp_cleanup import cleanup_temp_session
from ..services.upload_service import (
    upload_and_parse, create_book, add_format, BOOK_EXTENSIONS,
)
from ._validators import TempIdStr

log = logging.getLogger("librarium.upload")

router = APIRouter(tags=["upload"])


@router.post("/api/upload", response_model=UploadParseResponse)
async def upload_file(
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    file: Annotated[UploadFile, File()],
):
    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in BOOK_EXTENSIONS and ext != "zip":
        raise BadInputError(f"Unsupported format: {ext}")

    # Check size before reading into memory
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_BOOK_SIZE:
        raise BadInputError(f"Файл слишком большой (макс. {MAX_BOOK_SIZE // 1024 // 1024} МБ)")

    content = await file.read()
    result = await upload_and_parse(db, content, filename)

    log.info(
        "Uploaded temp_id=%s file=%s by user_id=%s",
        str(result.temp_id), safe_log(str(filename)), str(user.user_id),
    )
    return result


@router.delete("/api/uploads/{temp_id}", response_model=OkResponse)
def cleanup_temp(
    temp_id: TempIdStr,
    user: Annotated[CurrentUser, Depends(require_admin)],
):
    cleanup_temp_session(temp_id)
    return OkResponse()


@router.post("/api/books/create", response_model=CreateBookResponse)
def create_book_from_upload(
    body: CreateBookBody,
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
):
    book_id = create_book(db, body.temp_id, body.metadata)
    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="library"),
        event_type="bookCreated",
        payload={"bookId": book_id},
    )
    log.info("Created book=%d by user_id=%s", int(book_id), str(user.user_id))
    return CreateBookResponse(book_id=book_id)


@router.post("/api/books/{book_id}/add-format", response_model=AddFormatResponse)
def add_format_endpoint(
    book_id: int,
    body: AddFormatBody,
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
):
    fmt = add_format(db, book_id, body.temp_id)
    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="library"),
        event_type="bookUpdated",
        payload={"book": {"id": book_id}, "changedFields": ["files"]},
    )
    log.info(
        "Added format=%s book=%d by user_id=%s",
        safe_log(str(fmt)), int(book_id), str(user.user_id),
    )
    return AddFormatResponse(format=fmt)
