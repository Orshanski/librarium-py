"""Managed storage path policy.

All helpers return resolved ``Path`` objects and validate dynamic path parts
before filesystem callers receive them.
"""

from pathlib import Path, PurePosixPath
import contextlib
import os
import re

from .config import DATA_DIR, DB_PATH_PREFIX, LIBRARY_DIR, PROJECT_ROOT, UPLOADS_DIR
from .exceptions import BadInputError

BOOK_EXTS = {"fb2", "epub", "pdf"}
COVER_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}

_TEMP_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_UPLOAD_BOOK_RE = re.compile(r"^(?P<temp_id>[A-Za-z0-9_-]{1,64})\.(?P<ext>fb2|epub|pdf)$")
_UPLOAD_COVER_RE = re.compile(
    r"^(?P<temp_id>[A-Za-z0-9_-]{1,64})-cover\.(?P<ext>jpg|jpeg|png|webp|gif)$"
)
_UPLOAD_ZIP_RE = re.compile(r"^(?P<temp_id>[A-Za-z0-9_-]{1,64})\.zip$")
_THUMBS_DIR = DATA_DIR / "thumbs"
_FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


def _library_root() -> Path:
    return Path(os.path.realpath(str(LIBRARY_DIR)))


def _uploads_root() -> Path:
    return Path(os.path.realpath(str(UPLOADS_DIR)))


def _thumbs_root() -> Path:
    return Path(os.path.realpath(str(_THUMBS_DIR)))


def _frontend_root() -> Path:
    return Path(os.path.realpath(str(_FRONTEND_DIST)))


def _filename_segment(filename: str) -> str:
    basename = os.path.basename(filename)
    if basename != filename or basename in {"", ".", ".."}:
        raise BadInputError("Invalid managed storage filename")
    return basename


def _checked_file(root: Path, *segments: str) -> Path:
    candidate = root.joinpath(*(_filename_segment(segment) for segment in segments))
    try:
        candidate.parent.resolve().relative_to(root)
    except ValueError as exc:
        raise BadInputError("Path escapes managed storage root") from exc
    if candidate.is_symlink():
        raise BadInputError("Managed storage file must not be a symlink")
    return candidate


def _checked_dir(root: Path, segment: str) -> Path:
    candidate = root / _filename_segment(segment)
    if candidate.is_symlink():
        raise BadInputError("Managed storage directory must not be a symlink")
    return candidate


def _checked_frontend_path(*parts: str) -> Path:
    root = _frontend_root()
    candidate = Path(os.path.normpath(os.path.realpath(os.path.join(str(root), *parts))))
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise BadInputError("Path escapes frontend dist root") from exc
    return candidate


def _book_id_segment(book_id: int) -> str:
    if isinstance(book_id, bool) or not isinstance(book_id, int) or book_id < 1:
        raise BadInputError("Invalid book id")
    return os.path.basename(str(int(book_id)))


def _ext(ext: str, allowed: set[str]) -> str:
    if not isinstance(ext, str):
        raise BadInputError("Invalid extension")
    normalized = os.path.basename(ext.lower())
    if normalized != ext.lower():
        raise BadInputError("Invalid extension")
    if normalized not in {item.lower() for item in allowed}:
        raise BadInputError(f"Unsupported file extension: {ext or '(empty)'}")
    return normalized


def _temp_id_segment(temp_id: str) -> str:
    if not isinstance(temp_id, str) or not _TEMP_ID_RE.fullmatch(temp_id):
        raise BadInputError("Invalid temporary id")
    return os.path.basename(temp_id)


def _library_book_dir_lexical(book_id: int) -> Path:
    book_segment = _book_id_segment(book_id)
    return _checked_dir(_library_root(), book_segment)


def library_book_dir(book_id: int) -> Path:
    return _library_book_dir_lexical(book_id)


def library_book_dir_for_delete(book_id: int) -> Path:
    return _library_book_dir_lexical(book_id)


def library_book_file(book_id: int, ext: str) -> Path:
    return _library_file(book_id, "book", ext, BOOK_EXTS)


def library_cover_file(book_id: int, ext: str) -> Path:
    return _library_file(book_id, "cover", ext, COVER_EXTS)


def _library_file(book_id: int, stem: str, ext: str, allowed_exts: set[str]) -> Path:
    library_root = _library_root()
    book_segment = _book_id_segment(book_id)
    _checked_dir(library_root, book_segment)
    filename = _filename_segment(f"{_filename_segment(stem)}.{_ext(ext, allowed_exts)}")
    return _checked_file(library_root, book_segment, filename)


def library_cover_candidates(book_id: int) -> list[Path]:
    paths: list[Path] = []
    for ext in sorted(COVER_EXTS):
        with contextlib.suppress(BadInputError):
            paths.append(library_cover_file(book_id, ext))
    return paths


def current_library_cover(book_id: int) -> Path | None:
    for path in library_cover_candidates(book_id):
        if path.is_file():
            return path
    return None


def library_backup_file(path: str | Path) -> Path:
    library_root = _library_root()
    resolved = Path(os.path.normpath(os.path.realpath(os.fspath(path))))
    try:
        relative = resolved.relative_to(library_root)
    except ValueError as exc:
        raise BadInputError("Backup source must be under library storage") from exc

    if len(relative.parts) != 2:
        raise BadInputError("Backup source must be a managed library file")

    raw_book_segment, raw_filename = relative.parts
    try:
        book_segment = _book_id_segment(int(raw_book_segment))
        if book_segment != raw_book_segment:
            raise BadInputError("Invalid book id")
    except ValueError as exc:
        raise BadInputError("Invalid book id") from exc

    filename = _filename_segment(raw_filename)
    stem, dot, ext = filename.rpartition(".")
    if dot != ".":
        raise BadInputError("Backup source must be a managed library file")
    if stem == "book":
        _ext(ext, BOOK_EXTS)
    elif stem == "cover":
        _ext(ext, COVER_EXTS)
    else:
        raise BadInputError("Backup source must be a managed library file")

    return _checked_file(library_root, book_segment, f"{filename}.bak")


def upload_book_file(temp_id: str, ext: str) -> Path:
    filename = f"{_temp_id_segment(temp_id)}.{_ext(ext, BOOK_EXTS)}"
    return _checked_file(_uploads_root(), filename)


def upload_cover_file(temp_id: str, ext: str) -> Path:
    filename = f"{_temp_id_segment(temp_id)}-cover.{_ext(ext, COVER_EXTS)}"
    return _checked_file(_uploads_root(), filename)


def upload_zip_file(temp_id: str) -> Path:
    return _checked_file(_uploads_root(), f"{_temp_id_segment(temp_id)}.zip")


def upload_file_from_basename(name: str) -> Path | None:
    if not isinstance(name, str) or "/" in name or "\\" in name:
        return None

    match = _UPLOAD_BOOK_RE.fullmatch(name)
    if match:
        return upload_book_file(match.group("temp_id"), match.group("ext"))

    match = _UPLOAD_COVER_RE.fullmatch(name)
    if match:
        return upload_cover_file(match.group("temp_id"), match.group("ext"))

    match = _UPLOAD_ZIP_RE.fullmatch(name)
    if match:
        return upload_zip_file(match.group("temp_id"))

    return None


def upload_session_files(temp_id: str) -> list[Path]:
    temp_segment = _temp_id_segment(temp_id)
    paths: list[Path] = []
    for ext in sorted(BOOK_EXTS):
        with contextlib.suppress(BadInputError):
            path = upload_book_file(temp_segment, ext)
            if path.is_file():
                paths.append(path)
    for ext in sorted(COVER_EXTS):
        with contextlib.suppress(BadInputError):
            path = upload_cover_file(temp_segment, ext)
            if path.is_file():
                paths.append(path)
    with contextlib.suppress(BadInputError):
        path = upload_zip_file(temp_segment)
        if path.is_file():
            paths.append(path)
    return paths


def upload_policy_files() -> list[Path]:
    upload_root = _uploads_root()
    paths: list[Path] = []
    try:
        with os.scandir(str(upload_root)) as entries:
            for entry in entries:
                if not entry.is_file(follow_symlinks=False):
                    continue
                try:
                    path = upload_file_from_basename(entry.name)
                except BadInputError:
                    continue
                if path is not None and path.is_file():
                    paths.append(path)
    except FileNotFoundError:
        return []
    return paths



def upload_cover_candidates(temp_id: int | str) -> list[Path]:
    temp_segment = _book_id_segment(temp_id) if isinstance(temp_id, int) else _temp_id_segment(temp_id)
    paths: list[Path] = []
    for ext in sorted(COVER_EXTS):
        with contextlib.suppress(BadInputError):
            paths.append(upload_cover_file(temp_segment, ext))
    return paths


def thumb_file(book_id: int) -> Path:
    return _checked_file(_thumbs_root(), f"{_book_id_segment(book_id)}.jpg")


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

    library_root = _library_root()
    _ext(ext, allowed_exts)
    _checked_dir(library_root, book_segment)
    return _checked_file(library_root, book_segment, filename)


def library_file_from_db_path(book_id: int, db_path: str, allowed_exts: set[str]) -> Path:
    return _library_path_from_db(book_id, db_path, allowed_exts, expected_stem="book")


def cover_from_db_path(book_id: int, db_path: str) -> Path:
    return _library_path_from_db(book_id, db_path, COVER_EXTS, expected_stem="cover")


def frontend_dist_exists() -> bool:
    return _frontend_root().exists()


def frontend_assets_dir() -> Path:
    return _checked_frontend_path("assets")


def frontend_index_file() -> Path:
    return _checked_frontend_path("index.html")


def frontend_static_file(path: str) -> Path | None:
    try:
        candidate = _checked_frontend_path(path)
    except BadInputError:
        return None
    if candidate.is_file():
        return candidate
    return None
