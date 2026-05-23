"""Managed storage path policy.

All helpers return resolved ``Path`` objects and validate dynamic path parts
before filesystem callers receive them.
"""

from pathlib import Path, PurePosixPath
import re

from .config import DATA_DIR, DB_PATH_PREFIX, LIBRARY_DIR, PROJECT_ROOT, UPLOADS_DIR
from .exceptions import BadInputError

BOOK_EXTS = {"fb2", "epub", "pdf"}
COVER_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}

_TEMP_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_THUMBS_DIR = DATA_DIR / "thumbs"
_FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


def _root(path: Path) -> Path:
    return path.resolve()


def _resolve_under(root: Path, *parts: str) -> Path:
    root_resolved = _root(root)
    candidate = root_resolved.joinpath(*parts).resolve()
    try:
        candidate.relative_to(root_resolved)
    except ValueError as exc:
        raise BadInputError("Path escapes managed storage root") from exc
    return candidate


def _book_id_segment(book_id: int) -> str:
    if isinstance(book_id, bool) or not isinstance(book_id, int) or book_id < 1:
        raise BadInputError("Invalid book id")
    return str(book_id)


def _ext(ext: str, allowed: set[str]) -> str:
    if not isinstance(ext, str):
        raise BadInputError("Invalid extension")
    normalized = ext.lower()
    allowed_normalized = {item.lower() for item in allowed}
    if normalized not in allowed_normalized:
        raise BadInputError(f"Unsupported file extension: {ext or '(empty)'}")
    return normalized


def _temp_id_segment(temp_id: str) -> str:
    if not isinstance(temp_id, str) or not _TEMP_ID_RE.fullmatch(temp_id):
        raise BadInputError("Invalid temporary id")
    return temp_id


def _library_book_dir_lexical(book_id: int) -> Path:
    book_segment = _book_id_segment(book_id)
    library_root = _root(LIBRARY_DIR)
    candidate = library_root / book_segment
    if candidate.is_symlink():
        raise BadInputError("Library book directory must not be a symlink")
    return candidate


def library_book_dir(book_id: int) -> Path:
    return _library_book_dir_lexical(book_id)


def library_book_dir_for_delete(book_id: int) -> Path:
    return _library_book_dir_lexical(book_id)


def library_book_file(book_id: int, ext: str) -> Path:
    book_dir = _library_book_dir_lexical(book_id)
    return _resolve_under(book_dir, f"book.{_ext(ext, BOOK_EXTS)}")


def library_cover_file(book_id: int, ext: str) -> Path:
    return _resolve_under(
        LIBRARY_DIR,
        _book_id_segment(book_id),
        f"cover.{_ext(ext, COVER_EXTS)}",
    )


def library_cover_candidates(book_id: int) -> list[Path]:
    return [library_cover_file(book_id, ext) for ext in sorted(COVER_EXTS)]


def current_library_cover(book_id: int) -> Path | None:
    for path in library_cover_candidates(book_id):
        if path.is_file():
            return path
    return None


def library_backup_file(path: str | Path) -> Path:
    library_root = _root(LIBRARY_DIR)
    resolved = Path(path).resolve()
    try:
        relative = resolved.relative_to(library_root)
    except ValueError as exc:
        raise BadInputError("Backup source must be under library storage") from exc

    if len(relative.parts) != 2:
        raise BadInputError("Backup source must be a managed library file")

    book_segment, filename = relative.parts
    try:
        if _book_id_segment(int(book_segment)) != book_segment:
            raise BadInputError("Invalid book id")
    except ValueError as exc:
        raise BadInputError("Invalid book id") from exc

    stem, dot, ext = filename.rpartition(".")
    if dot != ".":
        raise BadInputError("Backup source must be a managed library file")
    if stem == "book":
        _ext(ext, BOOK_EXTS)
    elif stem == "cover":
        _ext(ext, COVER_EXTS)
    else:
        raise BadInputError("Backup source must be a managed library file")

    return _resolve_under(LIBRARY_DIR, book_segment, f"{filename}.bak")


def upload_book_file(temp_id: str, ext: str) -> Path:
    filename = f"{_temp_id_segment(temp_id)}.{_ext(ext, BOOK_EXTS)}"
    return _resolve_under(UPLOADS_DIR, filename)


def upload_cover_file(temp_id: str, ext: str) -> Path:
    filename = f"{_temp_id_segment(temp_id)}-cover.{_ext(ext, COVER_EXTS)}"
    return _resolve_under(UPLOADS_DIR, filename)


def upload_zip_file(temp_id: str) -> Path:
    return _resolve_under(UPLOADS_DIR, f"{_temp_id_segment(temp_id)}.zip")


def upload_session_files(temp_id: str) -> list[Path]:
    temp_segment = _temp_id_segment(temp_id)
    candidates = [
        *(upload_book_file(temp_segment, ext) for ext in sorted(BOOK_EXTS)),
        *(upload_cover_file(temp_segment, ext) for ext in sorted(COVER_EXTS)),
        upload_zip_file(temp_segment),
    ]
    return [path for path in candidates if path.exists()]


def upload_cover_candidates(book_id: int) -> list[Path]:
    temp_id = _book_id_segment(book_id)
    return [upload_cover_file(temp_id, ext) for ext in sorted(COVER_EXTS)]


def thumb_file(book_id: int) -> Path:
    return _resolve_under(_THUMBS_DIR, f"{_book_id_segment(book_id)}.jpg")


def _library_path_from_db(
    book_id: int,
    db_path: str,
    allowed_exts: set[str],
    expected_stem: str | None = None,
) -> Path:
    if not isinstance(db_path, str):
        raise BadInputError("Invalid managed database path")

    book_segment = _book_id_segment(book_id)
    if db_path.startswith("/") or "//" in db_path or db_path.endswith("/"):
        raise BadInputError("Invalid managed database path")

    db_parts = tuple(db_path.split("/"))
    if any(part in {"", ".", ".."} for part in db_parts):
        raise BadInputError("Invalid managed database path")

    prefix_parts = PurePosixPath(DB_PATH_PREFIX).parts
    expected_len = len(prefix_parts) + 2
    if (
        db_parts[: len(prefix_parts)] != prefix_parts
        or len(db_parts) != expected_len
        or db_parts[-2] != book_segment
    ):
        raise BadInputError("Invalid managed database path")

    filename = db_parts[-1]
    stem, dot, ext = filename.rpartition(".")
    if dot != "." or (expected_stem is not None and stem != expected_stem):
        raise BadInputError("Invalid managed database path")

    _ext(ext, allowed_exts)
    return _resolve_under(LIBRARY_DIR, book_segment, filename)


def library_file_from_db_path(book_id: int, db_path: str, allowed_exts: set[str]) -> Path:
    return _library_path_from_db(book_id, db_path, allowed_exts, expected_stem="book")


def cover_from_db_path(book_id: int, db_path: str) -> Path:
    return _library_path_from_db(book_id, db_path, COVER_EXTS, expected_stem="cover")


def frontend_static_file(path: str) -> Path | None:
    try:
        candidate = _resolve_under(_FRONTEND_DIST, path)
    except BadInputError:
        return None
    if candidate.is_file():
        return candidate
    return None
