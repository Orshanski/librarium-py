import glob
import io
import logging
import os
import sqlite3
import zipfile
from pathlib import Path

from lxml import etree
from PIL import Image

from ..config import LIBRARY_DIR, UPLOADS_DIR, db_path_for
from ..cover_embedder import embed_cover
from ..dal import books as books_dal
from ..dal.books import update_cover_path
from ..exceptions import BadInputError, NotFoundError
from ..fs_utils import move_with_rollback
from . import thumb
from .temp_cleanup import cleanup_old_uploads

log = logging.getLogger("librarium.services.covers")

_BOOK_NOT_FOUND = "Book not found"
_MAX_IMAGE_PIXELS = 25_000_000
_ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "GIF", "WEBP", "BMP", "TIFF"}
_THUMB_HEIGHT = 300

# Legitimate best-effort failure modes для embed_cover: FS I/O, повреждённые
# архивы / XML, non-UTF-8 байты в OPF/container.xml, domain-ограничения
# (FB2 без title-info). Программные баги (AttributeError, TypeError,
# чистый ValueError из-под нашего кода) НЕ маскируются — падают наверх.
#
# Carve-out: BadInputError — domain exception embed_cover_fb2 при FB2 без
# <title-info>. Хоть формально он наследует ValueError, семантически это
# malformed data (как XMLSyntaxError), не программный баг — поэтому здесь.
# По lxml: LxmlSyntaxError — корневой для XMLSyntaxError и ParseError;
# ParserError — отдельная ветка (parser state issues), тоже data-quality.
_EMBED_BEST_EFFORT_EXCEPTIONS = (
    OSError,
    UnicodeDecodeError,
    zipfile.BadZipFile,
    zipfile.LargeZipFile,
    etree.LxmlSyntaxError,
    etree.ParserError,
    BadInputError,
)

Image.MAX_IMAGE_PIXELS = _MAX_IMAGE_PIXELS


def upload_temp(db: sqlite3.Connection, book_id: int, content: bytes, ext: str) -> str:
    """Validate image and save as temp cover.

    Returns temp cover URL path.

    Raises:
      NotFoundError: if book doesn't exist
      BadInputError: if image is unsupported format or corrupted
    """
    if not books_dal.book_exists(db, book_id):
        raise NotFoundError(_BOOK_NOT_FOUND)

    # Self-healing orphan GC: снести brew-старые temp'ы до того как положим
    # свой. Без scheduler/cron — пользовательский upload-поток сам себя
    # обслуживает.
    cleanup_old_uploads()

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
    if not books_dal.book_exists(db, book_id):
        raise NotFoundError(_BOOK_NOT_FOUND)
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
    old_path = os.path.join(book_dir, old) if old else None

    # Если у книги уже есть обложка — сначала переименовываем её в .bak. Это
    # снимает проблему с одноименным overwrite'ом: `shutil.move` в
    # move_with_rollback без backup'а перетёр бы старый файл, а при
    # последующем exception (e.g. DB-failure) `os.remove(dst)` удалил бы
    # перетёртое содержимое целиком, оставив книгу без файла обложки.
    # `find_cover` игнорирует *.bak, так что промежуточное состояние
    # снаружи не видно.
    old_bak = None
    if old_path:
        old_bak = f"{old_path}.bak"
        os.rename(old_path, old_bak)

    try:
        with move_with_rollback(src, dst):
            update_cover_path(db, book_id, db_path_for(book_id, f"cover.{ext}"))
    except Exception:
        # move/DB провалились → восстанавливаем старую обложку из bak.
        # move_with_rollback уже удалил dst если успел его создать; но если
        # shutil.move упал при overwrite — dst может частично существовать.
        if old_bak and os.path.exists(old_bak):
            if os.path.exists(dst):
                os.remove(dst)
            os.rename(old_bak, old_path)
        raise

    # Success: старая обложка (теперь в bak) больше не нужна — удаляем.
    if old_bak:
        os.remove(old_bak)

    thumb.invalidate(book_id)

    # Embed cover into book files (best-effort).
    # Catch только легитимные failure modes (см. _EMBED_BEST_EFFORT_EXCEPTIONS).
    # Программные баги (AttributeError, TypeError и т.д.) пропускаем наверх —
    # основной commit уже прошёл, но внезапная AttributeError должна падать в
    # логи stack-trace'ом, не тихо warning'ом.
    try:
        embed_cover(db, book_id)
    except _EMBED_BEST_EFFORT_EXCEPTIONS as e:
        log.warning("Failed to embed cover into book files: %s", e)

    return True


def find_cover(book_dir: str) -> str | None:
    """Find cover file in book directory, excluding backups."""
    if not os.path.isdir(book_dir):
        return None
    return next((f for f in os.listdir(book_dir) if f.startswith("cover.") and "bak" not in f), None)


def get_cover_path(book_id: int) -> str:
    """Resolve full cover path for a book. Raises NotFoundError if no cover exists."""
    book_dir = str(LIBRARY_DIR / str(book_id))
    cover = find_cover(book_dir)
    if not cover:
        raise NotFoundError("Cover not found")
    return os.path.join(book_dir, cover)


def get_thumb(book_id: int, cover_path: str) -> str | None:
    """Generate (or return cached) thumbnail for a cover.

    Returns thumb path on success, or None on any failure. Caller (router)
    decides fallback (e.g. serve full cover when thumb generation failed).
    """
    thumb_path = str(thumb.THUMBS_DIR / f"{book_id}.jpg")
    try:
        if os.path.exists(thumb_path) and os.path.getmtime(thumb_path) >= os.path.getmtime(cover_path):
            return thumb_path
        original = Image.open(cover_path)
        try:
            ratio = _THUMB_HEIGHT / original.height
            new_size = (int(original.width * ratio), _THUMB_HEIGHT)
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
    except Exception as e:
        log.warning("Failed to generate thumbnail for book=%d: %s", book_id, e)
        return None


def get_temp_cover_path(temp_id: str) -> str:
    """Resolve temp cover path by temp_id. Raises NotFoundError if absent."""
    for f in os.listdir(str(UPLOADS_DIR)):
        if f.startswith(f"{temp_id}-cover."):
            return str(UPLOADS_DIR / f)
    raise NotFoundError("Temp cover not found")


def discard_temp(db: sqlite3.Connection, book_id: int) -> None:
    """Remove any temp cover files for a book. Raises NotFoundError if book doesn't exist."""
    if not books_dal.book_exists(db, book_id):
        raise NotFoundError(_BOOK_NOT_FOUND)
    for f in glob.glob(str(UPLOADS_DIR / f"{book_id}-cover.*")):
        os.remove(f)
