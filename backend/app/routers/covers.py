import logging
import os
import glob
from fastapi import APIRouter, Request, UploadFile, File
from fastapi.responses import FileResponse, Response, JSONResponse
from PIL import Image
from ..auth import get_current_user, require_admin

log = logging.getLogger("librarium.covers")
from ..config import LIBRARY_DIR, DATA_DIR, UPLOADS_DIR, MAX_COVER_SIZE

_MAX_IMAGE_PIXELS = 25_000_000
_ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "GIF", "WEBP", "BMP", "TIFF"}

# Set once at module level — thread-safe, no toggling per-call
Image.MAX_IMAGE_PIXELS = _MAX_IMAGE_PIXELS

from ..database import get_db
from ..dal.books import get_book_by_id

router = APIRouter(tags=["covers"])

THUMBS_DIR = DATA_DIR / "thumbs"
THUMBS_DIR.mkdir(exist_ok=True)
THUMB_HEIGHT = 300


def _get_thumb(book_id: int, cover_path: str) -> str:
    thumb_path = str(THUMBS_DIR / f"{book_id}.jpg")
    if os.path.exists(thumb_path) and os.path.getmtime(thumb_path) >= os.path.getmtime(cover_path):
        return thumb_path
    img = Image.open(cover_path)
    ratio = THUMB_HEIGHT / img.height
    new_size = (int(img.width * ratio), THUMB_HEIGHT)
    img = img.resize(new_size, Image.LANCZOS)
    img = img.convert("RGB")
    img.save(thumb_path, "JPEG", quality=80)
    return thumb_path


def _find_cover(book_dir: str) -> str | None:
    if not os.path.isdir(book_dir):
        return None
    return next((f for f in os.listdir(book_dir) if f.startswith("cover.") and "bak" not in f), None)


@router.get("/api/covers/{book_id}")
def get_cover(book_id: int, request: Request, full: int = 0):
    get_current_user(request)
    book_dir = str(LIBRARY_DIR / str(book_id))
    cover = _find_cover(book_dir)
    if not cover:
        return Response(status_code=404)

    cover_path = os.path.join(book_dir, cover)

    if full:
        return FileResponse(cover_path, headers={"Cache-Control": "public, max-age=3600"})

    try:
        thumb = _get_thumb(book_id, cover_path)
    except Exception:
        log.warning("Failed to generate thumbnail for book=%d, serving full cover", book_id)
        return FileResponse(cover_path, headers={"Cache-Control": "public, max-age=3600"})
    return FileResponse(thumb, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})


# --- POST: upload cover to temp ---
@router.post("/api/books/{book_id}/cover")
async def upload_cover(book_id: int, request: Request, file: UploadFile = File(...)):
    require_admin(request)
    if not get_book_by_id(book_id):
        return JSONResponse({"error": "Book not found"}, status_code=404)
    ext = (file.filename or "cover.jpg").split(".")[-1].lower() or "jpg"

    # Clean old temp covers for this book
    for old in glob.glob(str(UPLOADS_DIR / f"{book_id}-cover.*")):
        os.remove(old)

    temp_path = str(UPLOADS_DIR / f"{book_id}-cover.{ext}")
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_COVER_SIZE:
        return JSONResponse({"error": "Файл обложки слишком большой"}, status_code=400)

    content = await file.read()

    # Validate image before saving
    import io
    try:
        img = Image.open(io.BytesIO(content))
        fmt = (img.format or "").upper()
        if fmt not in _ALLOWED_IMAGE_FORMATS:
            return JSONResponse({"error": f"Неподдерживаемый формат: {fmt or 'unknown'}"}, status_code=400)
        img.load()
    except Exception:
        return JSONResponse({"error": "Файл не является изображением или повреждён"}, status_code=400)

    with open(temp_path, "wb") as f:
        f.write(content)

    return JSONResponse({"ok": True, "tempCoverUrl": f"/api/uploads/cover/{book_id}"})


# --- GET: serve temp cover preview ---
@router.get("/api/uploads/cover/{book_id}")
def get_temp_cover(book_id: str, request: Request):
    import re
    get_current_user(request)
    if not re.match(r'^[a-zA-Z0-9]{1,20}$', book_id):
        return Response(status_code=400)
    for f in os.listdir(str(UPLOADS_DIR)):
        if f.startswith(f"{book_id}-cover."):
            return FileResponse(str(UPLOADS_DIR / f), headers={"Cache-Control": "no-cache"})
    return Response(status_code=404)


# --- PUT: commit temp cover → library ---
@router.put("/api/books/{book_id}/cover")
def commit_cover(book_id: int, request: Request):
    user = require_admin(request)
    if not get_book_by_id(book_id):
        return JSONResponse({"error": "Book not found"}, status_code=404)
    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)

    # Find temp cover
    temp_file = None
    for f in os.listdir(str(UPLOADS_DIR)):
        if f.startswith(f"{book_id}-cover."):
            temp_file = f
            break

    if not temp_file:
        return JSONResponse({"ok": True})  # nothing to commit

    ext = temp_file.split(".")[-1]
    src = str(UPLOADS_DIR / temp_file)
    dst = os.path.join(book_dir, f"cover.{ext}")

    # Remove old cover
    old = _find_cover(book_dir)
    if old:
        os.remove(os.path.join(book_dir, old))

    # Move temp → library
    os.rename(src, dst)

    # Update DB
    db = get_db()
    db.execute("UPDATE books SET cover_path = :cp, updated_at = CURRENT_TIMESTAMP WHERE id = :id",
               {"cp": f"data/library/{book_id}/cover.{ext}", "id": book_id})
    db.commit()

    # Invalidate thumb
    thumb = str(THUMBS_DIR / f"{book_id}.jpg")
    if os.path.exists(thumb):
        os.remove(thumb)

    log.info("Cover updated book=%d by user_id=%s", book_id, user["userId"])

    from ..cover_embedder import embed_cover
    try:
        embed_cover(book_id)
    except Exception as e:
        log.warning("Failed to embed cover into book files: %s", e)

    return JSONResponse({"ok": True})


# --- DELETE: discard temp cover ---
@router.delete("/api/books/{book_id}/cover")
def discard_cover(book_id: int, request: Request):
    require_admin(request)
    for f in glob.glob(str(UPLOADS_DIR / f"{book_id}-cover.*")):
        os.remove(f)
    return JSONResponse({"ok": True})
