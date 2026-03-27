import os
import glob
from fastapi import APIRouter, Request, UploadFile, File
from fastapi.responses import FileResponse, Response, JSONResponse
from PIL import Image
from ..auth import get_current_user, require_admin
from ..config import LIBRARY_DIR, DATA_DIR, UPLOADS_DIR
from ..database import get_db

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


# --- GET cover (public, no auth) ---
@router.get("/api/covers/{book_id}")
def get_cover(book_id: int, full: int = 0):
    book_dir = str(LIBRARY_DIR / str(book_id))
    cover = _find_cover(book_dir)
    if not cover:
        return Response(status_code=404)

    cover_path = os.path.join(book_dir, cover)

    if full:
        return FileResponse(cover_path, headers={"Cache-Control": "public, max-age=3600"})

    thumb = _get_thumb(book_id, cover_path)
    return FileResponse(thumb, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


# --- POST: upload cover to temp ---
@router.post("/api/books/{book_id}/cover")
async def upload_cover(book_id: int, request: Request, file: UploadFile = File(...)):
    require_admin(request)
    ext = (file.filename or "cover.jpg").split(".")[-1].lower() or "jpg"

    # Clean old temp covers for this book
    for old in glob.glob(str(UPLOADS_DIR / f"{book_id}-cover.*")):
        os.remove(old)

    temp_path = str(UPLOADS_DIR / f"{book_id}-cover.{ext}")
    content = await file.read()
    with open(temp_path, "wb") as f:
        f.write(content)

    return JSONResponse({"ok": True, "tempCoverUrl": f"/api/uploads/cover/{book_id}"})


# --- GET: serve temp cover preview ---
@router.get("/api/uploads/cover/{book_id}")
def get_temp_cover(book_id: int):
    for f in os.listdir(str(UPLOADS_DIR)):
        if f.startswith(f"{book_id}-cover."):
            return FileResponse(str(UPLOADS_DIR / f), headers={"Cache-Control": "no-cache"})
    return Response(status_code=404)


# --- PUT: commit temp cover → library ---
@router.put("/api/books/{book_id}/cover")
def commit_cover(book_id: int, request: Request):
    require_admin(request)
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

    return JSONResponse({"ok": True})


# --- DELETE: discard temp cover ---
@router.delete("/api/books/{book_id}/cover")
def discard_cover(book_id: int, request: Request):
    require_admin(request)
    for f in glob.glob(str(UPLOADS_DIR / f"{book_id}-cover.*")):
        os.remove(f)
    return JSONResponse({"ok": True})
