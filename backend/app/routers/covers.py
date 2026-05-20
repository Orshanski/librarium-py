from typing import Annotated
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
from ..fs_utils import safe_extension
from ..services import cover_service
from ._validators import TempIdStr

_COVER_EXTS = {"jpg", "jpeg", "png", "gif", "webp"}

log = logging.getLogger("librarium.covers")

router = APIRouter(tags=["covers"])


@router.get("/api/covers/{book_id}")
def get_cover(
    book_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
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


@router.post("/api/books/{book_id}/cover")
async def upload_cover(
    book_id: int,
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    file: Annotated[UploadFile, File()],
) -> CoverUploadResponse:
    ext = safe_extension(file.filename or "cover.jpg", _COVER_EXTS, default="jpg")

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_COVER_SIZE:
        raise BadInputError("Файл обложки слишком большой")

    content = await file.read()
    temp_url = cover_service.upload_temp(db, book_id, content, ext)
    return CoverUploadResponse(tempCoverUrl=temp_url)


@router.get("/api/uploads/cover/{temp_id}")
def get_temp_cover(temp_id: TempIdStr, user: Annotated[CurrentUser, Depends(get_current_user)]):
    path = cover_service.get_temp_cover_path(temp_id)
    return FileResponse(path, headers={"Cache-Control": "no-cache"})


@router.delete("/api/books/{book_id}/cover")
def discard_cover(book_id: int, user: Annotated[CurrentUser, Depends(require_admin)], db: Annotated[sqlite3.Connection, Depends(db_session)]) -> OkResponse:
    cover_service.discard_temp(db, book_id)
    return OkResponse()
