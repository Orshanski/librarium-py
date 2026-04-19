import sqlite3
from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
import logging

from ..auth import CurrentUser, get_current_user, require_admin
from ..config import MAX_COVER_SIZE
from ..database import db_session
from ..dtos import OkResponse
from ..dtos.covers import CoverUploadResponse
from ..exceptions import BadInputError
from ..services import cover_service
from ._validators import TempIdStr

log = logging.getLogger("librarium.covers")

router = APIRouter(tags=["covers"])


@router.get("/api/covers/{book_id}")
def get_cover(
    book_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    full: int = 0,
):
    cover_path = cover_service.get_cover_path(book_id)
    headers = {"Cache-Control": "public, max-age=3600"}
    if full:
        return FileResponse(cover_path, headers=headers)
    thumb_path = cover_service.get_thumb(book_id, cover_path)
    if thumb_path is None:
        return FileResponse(cover_path, headers=headers)
    return FileResponse(thumb_path, media_type="image/jpeg", headers=headers)


@router.post("/api/books/{book_id}/cover", response_model=CoverUploadResponse)
async def upload_cover(
    book_id: int,
    user: CurrentUser = Depends(require_admin),
    db: sqlite3.Connection = Depends(db_session),
    file: UploadFile = File(...),
) -> CoverUploadResponse:
    parts = (file.filename or "cover.jpg").rsplit(".", 1)
    ext = parts[-1].lower() if len(parts) > 1 else "jpg"

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_COVER_SIZE:
        raise BadInputError("Файл обложки слишком большой")

    content = await file.read()
    temp_url = cover_service.upload_temp(db, book_id, content, ext)
    return CoverUploadResponse(tempCoverUrl=temp_url)


@router.get("/api/uploads/cover/{temp_id}")
def get_temp_cover(temp_id: TempIdStr, user: CurrentUser = Depends(get_current_user)):
    path = cover_service.get_temp_cover_path(temp_id)
    return FileResponse(path, headers={"Cache-Control": "no-cache"})


@router.put("/api/books/{book_id}/cover", response_model=OkResponse)
def commit_cover(book_id: int, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)) -> OkResponse:
    if not cover_service.commit(db, book_id):
        raise BadInputError("No pending cover to commit")
    log.info("Cover updated book=%d by user_id=%s", book_id, user.user_id)
    return OkResponse()


@router.delete("/api/books/{book_id}/cover", response_model=OkResponse)
def discard_cover(book_id: int, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)) -> OkResponse:
    cover_service.discard_temp(db, book_id)
    return OkResponse()
