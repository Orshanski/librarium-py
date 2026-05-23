import io
import logging
import os
import sqlite3
import zipfile
from pathlib import Path

from lxml import etree  # pyright: ignore[reportAttributeAccessIssue]  # lxml stubs miss etree
from PIL import Image

from .. import storage_paths
from ..config import db_path_for
from ..cover_embedder import embed_cover
from ..dal import books as books_dal
from ..dal.books import update_cover_path
from ..exceptions import BadInputError, NotFoundError
from ..fs_utils import move_with_rollback, safe_extension
from ..logging_utils import safe as safe_log
from . import thumb
from .temp_cleanup import cleanup_old_uploads

# Whitelist для cover-форматов: дублирует router-валидацию как defense-in-depth.
# Любой новый caller upload_temp обязан пройти ext-чек на этом уровне.
_COVER_EXTS = {"jpg", "jpeg", "png", "gif", "webp"}

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

    # Defense-in-depth: ext-whitelist на уровне сервиса. Router уже валидирует
    # через safe_extension, но любой будущий caller должен пройти ту же проверку.
    ext = safe_extension(f"x.{ext}", _COVER_EXTS, default="jpg")

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

    # Clean old temp covers for this book — policy skips unsafe/symlink entries.
    for old in storage_paths.upload_cover_candidates(book_id):
        if old.is_file():
            old.unlink()

    temp_path = storage_paths.upload_cover_file(str(book_id), ext)
    with open(temp_path, "wb") as f:
        f.write(content)

    return f"/api/uploads/cover/{book_id}"


def _find_temp_cover(book_id: int) -> Path | None:
    """Найти временную обложку для книги в UPLOADS_DIR."""
    return next((path for path in storage_paths.upload_cover_candidates(book_id) if path.is_file()), None)


def _backup_existing(old_path: str | Path) -> str:
    """Переименовать существующую обложку в .bak, вернуть путь bak."""
    # Это снимает проблему с одноименным overwrite'ом: `shutil.move` в
    # move_with_rollback без backup'а перетёр бы старый файл, а при
    # последующем exception (e.g. DB-failure) `os.remove(dst)` удалил бы
    # перетёртое содержимое целиком, оставив книгу без файла обложки.
    # `find_cover` игнорирует *.bak, так что промежуточное состояние
    # снаружи не видно.
    old_bak = storage_paths.library_backup_file(old_path)
    os.rename(old_path, old_bak)
    return str(old_bak)


def _restore_from_backup(dst: str, old_bak: str, old_path: str) -> None:
    """Откатить частичный commit: удалить dst (если успел создаться) и вернуть .bak на место."""
    # move_with_rollback уже удалил dst если успел его создать; но если
    # shutil.move упал при overwrite — dst может частично существовать.
    if os.path.exists(old_bak):
        if os.path.exists(dst):
            os.remove(dst)
        os.rename(old_bak, old_path)


def _try_embed(db: sqlite3.Connection, book_id: int) -> None:
    """Встроить обложку в файлы книги (best-effort, не роняет commit при легитимных FS/zip/xml ошибках)."""
    # Embed cover into book files (best-effort).
    # Catch только легитимные failure modes (см. _EMBED_BEST_EFFORT_EXCEPTIONS).
    # Программные баги (AttributeError, TypeError и т.д.) пропускаем наверх —
    # основной commit уже прошёл, но внезапная AttributeError должна падать в
    # логи stack-trace'ом, не тихо warning'ом.
    try:
        embed_cover(db, book_id)
    except _EMBED_BEST_EFFORT_EXCEPTIONS as e:
        log.warning("Failed to embed cover into book files: %s", e)


def _commit(db: sqlite3.Connection, book_id: int) -> bool:
    """Move temp cover to library, update DB, invalidate thumb, embed into book files.

    Returns True if a cover was committed, False if no temp cover found.
    """
    if not books_dal.book_exists(db, book_id):
        raise NotFoundError(_BOOK_NOT_FOUND)
    book_dir = storage_paths.library_book_dir(book_id)
    os.makedirs(book_dir, exist_ok=True)

    temp_file = _find_temp_cover(book_id)
    if not temp_file:
        return False

    # Defense-in-depth: ext-whitelist даже на temp_file, который сам прошёл
    # валидацию в upload_temp — если UPLOADS_DIR будет скомпрометирован любым
    # другим путём, glob может вернуть имя с traversal-ext.
    ext = safe_extension(temp_file.name, _COVER_EXTS, default="jpg")
    src = str(storage_paths.upload_cover_file(str(book_id), ext))
    dst = str(storage_paths.library_cover_file(book_id, ext))
    old_path = storage_paths.current_library_cover(book_id)

    old_bak = _backup_existing(old_path) if old_path is not None else None

    try:
        with move_with_rollback(src, dst):
            update_cover_path(db, book_id, db_path_for(book_id, f"cover.{ext}"))
    except Exception:
        if old_bak is not None and old_path is not None:
            _restore_from_backup(dst, old_bak, old_path)
        raise

    # Success: старая обложка (теперь в bak) больше не нужна — удаляем.
    if old_bak:
        os.remove(old_bak)

    thumb.invalidate(book_id)
    _try_embed(db, book_id)

    return True


def find_cover(book_dir: str) -> str | None:
    """Find cover file in book directory, excluding backups."""
    try:
        book_id = int(Path(book_dir).name)
    except ValueError:
        return None
    cover = storage_paths.current_library_cover(book_id)
    return cover.name if cover is not None else None


def get_cover_path(book_id: int) -> str:
    """Resolve full cover path for a book. Raises NotFoundError if no cover exists."""
    cover = storage_paths.current_library_cover(book_id)
    if not cover:
        raise NotFoundError("Cover not found")
    return str(cover)


def get_thumb(book_id: int, cover_path: str) -> str | None:
    """Generate (or return cached) thumbnail for a cover.

    Returns thumb path on success, or None on any failure. Caller (router)
    decides fallback (e.g. serve full cover when thumb generation failed).
    """
    try:
        thumb_path = storage_paths.thumb_file(book_id)
        if os.path.exists(thumb_path) and os.path.getmtime(thumb_path) >= os.path.getmtime(cover_path):
            return str(thumb_path)
        original = Image.open(cover_path)
        try:
            ratio = _THUMB_HEIGHT / original.height
            new_size = (int(original.width * ratio), _THUMB_HEIGHT)
            resized = original.resize(new_size, Image.Resampling.LANCZOS)
        finally:
            original.close()
        try:
            converted = resized.convert("RGB")
        finally:
            resized.close()
        try:
            thumb_path.parent.mkdir(exist_ok=True)
            converted.save(thumb_path, "JPEG", quality=80)
        finally:
            converted.close()
        return str(thumb_path)
    except Exception as e:
        log.warning("Failed to generate thumbnail for book=%d: %s", book_id, safe_log(e))
        return None


def get_temp_cover_path(temp_id: str) -> str:
    """Resolve temp cover path by temp_id. Raises NotFoundError if absent."""
    for path in storage_paths.upload_cover_candidates(temp_id):
        if path.is_file():
            return str(path)
    raise NotFoundError("Temp cover not found")


def discard_temp(db: sqlite3.Connection, book_id: int) -> None:
    """Remove any temp cover files for a book. Raises NotFoundError if book doesn't exist."""
    if not books_dal.book_exists(db, book_id):
        raise NotFoundError(_BOOK_NOT_FOUND)
    for path in storage_paths.upload_cover_candidates(book_id):
        if path.is_file():
            path.unlink()
