import glob
import io
import logging
import os
import sqlite3

from PIL import Image

from ..config import LIBRARY_DIR, UPLOADS_DIR, db_path_for
from ..cover_embedder import embed_cover
from ..dal.books import get_book_by_id, update_cover_path
from ..exceptions import BadInputError
from ..fs_utils import move_with_rollback
from . import thumb

log = logging.getLogger("librarium.covers")

_MAX_IMAGE_PIXELS = 25_000_000
_ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "GIF", "WEBP", "BMP", "TIFF"}

Image.MAX_IMAGE_PIXELS = _MAX_IMAGE_PIXELS


def upload_temp(book_id: int, content: bytes, ext: str) -> str:
    """Validate image and save as temp cover.

    Returns temp cover URL path.
    Raises ValueError on invalid image.
    """
    # Validate image
    try:
        img = Image.open(io.BytesIO(content))
        fmt = (img.format or "").upper()
        if fmt not in _ALLOWED_IMAGE_FORMATS:
            raise BadInputError(f"Неподдерживаемый формат: {fmt or 'unknown'}")
        img.load()
    except BadInputError:
        raise
    except Exception:
        raise BadInputError("Файл не является изображением или повреждён")

    # Clean old temp covers for this book
    for old in glob.glob(str(UPLOADS_DIR / f"{book_id}-cover.*")):
        os.remove(old)

    temp_path = str(UPLOADS_DIR / f"{book_id}-cover.{ext}")
    with open(temp_path, "wb") as f:
        f.write(content)

    return f"/api/uploads/cover/{book_id}"


def commit(db: sqlite3.Connection, book_id: int) -> bool:
    """Move temp cover to library, update DB, invalidate thumb, embed into book files.

    Returns True if a cover was committed, False if no temp cover found.
    """
    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)

    # Find temp cover
    temp_file = None
    for f in os.listdir(str(UPLOADS_DIR)):
        if f.startswith(f"{book_id}-cover."):
            temp_file = f
            break

    if not temp_file:
        return False

    ext = temp_file.rsplit(".", 1)[-1]
    src = str(UPLOADS_DIR / temp_file)
    dst = os.path.join(book_dir, f"cover.{ext}")
    old = find_cover(book_dir)

    # Move + DB защищены move_with_rollback: при exception внутри with-блока
    # dst удаляется, старая обложка остаётся на месте (она ещё не тронута).
    with move_with_rollback(src, dst):
        update_cover_path(db, book_id, db_path_for(book_id, f"cover.{ext}"))

    # Старая обложка удаляется ПОСЛЕ успеха move+DB: при падении move книга
    # сохраняет старую обложку вместо того чтобы остаться без неё.
    if old and old != f"cover.{ext}":
        os.remove(os.path.join(book_dir, old))

    thumb.invalidate(book_id)

    # Embed cover into book files (best-effort).
    try:
        embed_cover(db, book_id)
    except Exception as e:
        # Широкий catch сохраняется: основной commit уже прошёл (move+DB
        # закоммичены), embed это best-effort проход по book-файлам
        # (FB2/EPUB cover embed). Сужение до конкретных типов — отдельная
        # задача error-handling, не DRY-консолидации.
        log.warning("Failed to embed cover into book files: %s", e)

    return True


def find_cover(book_dir: str) -> str | None:
    """Find cover file in book directory, excluding backups."""
    if not os.path.isdir(book_dir):
        return None
    return next((f for f in os.listdir(book_dir) if f.startswith("cover.") and "bak" not in f), None)
