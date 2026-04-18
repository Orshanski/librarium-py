import glob
import logging
import os
import sqlite3

from fastapi import APIRouter, Depends, File, Path, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

from ..auth import get_current_user, require_admin
from ..config import LIBRARY_DIR, UPLOADS_DIR, MAX_COVER_SIZE
from ..database import db_session
from ..dal.books import get_book_by_id
from ..exceptions import BadInputError, NotFoundError
from ..services import cover_service
from ..services.cover_service import find_cover
from ..services.thumb import THUMBS_DIR

log = logging.getLogger("librarium.covers")

router = APIRouter(tags=["covers"])

THUMB_HEIGHT = 300


def _get_thumb(book_id: int, cover_path: str) -> str:
    thumb_path = str(THUMBS_DIR / f"{book_id}.jpg")
    if os.path.exists(thumb_path) and os.path.getmtime(thumb_path) >= os.path.getmtime(cover_path):
        return thumb_path
    original = Image.open(cover_path)
    try:
        ratio = THUMB_HEIGHT / original.height
        new_size = (int(original.width * ratio), THUMB_HEIGHT)
        resized = original.resize(new_size, Image.LANCZOS)
    finally:
        original.close()
    try:
        converted = resized.convert("RGB")
    finally:
        resized.close()
    try:
        converted.save(thumb_path, "JPEG", quality=80)
    finally:
        converted.close()
    return thumb_path


@router.get("/api/covers/{book_id}")
def get_cover(
    book_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    full: int = 0,
):
    book_dir = str(LIBRARY_DIR / str(book_id))
    cover = find_cover(book_dir)
    if not cover:
        raise NotFoundError("Cover not found")

    cover_path = os.path.join(book_dir, cover)

    if full:
        return FileResponse(cover_path, headers={"Cache-Control": "public, max-age=3600"})

    try:
        thumb = _get_thumb(book_id, cover_path)
    except Exception:
        log.warning("Failed to generate thumbnail for book=%d, serving full cover", book_id)
        return FileResponse(cover_path, headers={"Cache-Control": "public, max-age=3600"})
    return FileResponse(thumb, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


@router.post("/api/books/{book_id}/cover")
async def upload_cover(
    book_id: int,
    user: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(db_session),
    file: UploadFile = File(...),
):
    if not get_book_by_id(db, book_id):
        raise NotFoundError("Book not found")

    parts = (file.filename or "cover.jpg").rsplit(".", 1)
    ext = parts[-1].lower() if len(parts) > 1 else "jpg"

    # Size check before reading
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_COVER_SIZE:
        raise BadInputError("Файл обложки слишком большой")

    content = await file.read()
    temp_url = cover_service.upload_temp(book_id, content, ext)

    return JSONResponse({"ok": True, "tempCoverUrl": temp_url})


@router.get("/api/uploads/cover/{temp_id}")
def get_temp_cover(
    temp_id: str = Path(..., pattern=r'^[a-zA-Z0-9]{1,20}$'),
    user: dict = Depends(get_current_user),
):
    for f in os.listdir(str(UPLOADS_DIR)):
        if f.startswith(f"{temp_id}-cover."):
            return FileResponse(str(UPLOADS_DIR / f), headers={"Cache-Control": "no-cache"})
    raise NotFoundError("Temp cover not found")


@router.put("/api/books/{book_id}/cover")
def commit_cover(book_id: int, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    if not get_book_by_id(db, book_id):
        raise NotFoundError("Book not found")

    cover_service.commit(db, book_id)
    log.info("Cover updated book=%d by user_id=%s", book_id, user["userId"])
    return JSONResponse({"ok": True})


@router.delete("/api/books/{book_id}/cover")
def discard_cover(book_id: int, user: dict = Depends(require_admin)):
    for f in glob.glob(str(UPLOADS_DIR / f"{book_id}-cover.*")):
        os.remove(f)
    return JSONResponse({"ok": True})
