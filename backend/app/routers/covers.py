import os
from fastapi import APIRouter
from fastapi.responses import FileResponse, Response
from PIL import Image
from ..config import LIBRARY_DIR, DATA_DIR

router = APIRouter(tags=["covers"])

THUMBS_DIR = DATA_DIR / "thumbs"
THUMBS_DIR.mkdir(exist_ok=True)
THUMB_HEIGHT = 300  # чуть больше чем 230px на экране, для retina


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


@router.get("/api/covers/{book_id}")
def get_cover(book_id: int, full: int = 0):
    book_dir = str(LIBRARY_DIR / str(book_id))
    if not os.path.isdir(book_dir):
        return Response(status_code=404)
    cover = next((f for f in os.listdir(book_dir) if f.startswith("cover.") and "bak" not in f), None)
    if not cover:
        return Response(status_code=404)

    cover_path = os.path.join(book_dir, cover)

    if full:
        return FileResponse(cover_path, headers={"Cache-Control": "public, max-age=3600"})

    thumb = _get_thumb(book_id, cover_path)
    return FileResponse(thumb, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})
