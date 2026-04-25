import asyncio
import logging
import os
import sqlite3
import uuid
import zipfile
from contextlib import ExitStack
from pathlib import Path

from ..config import UPLOADS_DIR, MAX_BOOK_SIZE, db_path_for
from ..dtos.books import BookCreateData, DuplicateHit
from ..dtos.upload import CreateBookMetadata, UploadParseResponse
from ..exceptions import BadInputError
from ..fs_utils import move_with_rollback
from ..parsers import parse_book, ParsedMetadata
from ..enrichers import enrich_metadata, resolve_genres
from ..dal.books import (
    create_book as dal_create_book, update_cover_path, add_book_identifier,
    find_duplicates_by_title,
)
from .book_file_writer import (
    book_dir_and_dst, prepare_book_format_path, register_and_linearize,
)
from .entity_resolver import resolve_authors, resolve_tags, resolve_series
from .temp_cleanup import (
    cleanup_old_uploads, cleanup_temp_session, find_temp_covers, find_temp_file,
)

log = logging.getLogger("librarium.services.upload")

BOOK_EXTENSIONS = {"fb2", "epub", "pdf"}


def _temp_book_path(temp_id: str, ext: str) -> str:
    return str(UPLOADS_DIR / f"{temp_id}.{ext}")


def _temp_cover_path(temp_id: str, cover_ext: str) -> str:
    return str(UPLOADS_DIR / f"{temp_id}-cover.{cover_ext}")


def _extract_from_zip(content: bytes, temp_id: str) -> tuple[bytes, str, str]:
    """Extract single book file from ZIP. Returns (content, ext, filename_hint).

    Raises ValueError with user-facing error message on failure.
    """
    zip_path = str(UPLOADS_DIR / f"{temp_id}.zip")
    with open(zip_path, "wb") as f:
        f.write(content)
    try:
        with zipfile.ZipFile(zip_path) as zf:
            book_files = [n for n in zf.namelist() if n.rsplit(".", 1)[-1].lower() in BOOK_EXTENSIONS]
            if len(book_files) == 0:
                raise BadInputError("ZIP не содержит книг (fb2/epub/pdf)")
            if len(book_files) > 1:
                raise BadInputError(f"ZIP содержит несколько книг: {', '.join(book_files)}")
            book_name = book_files[0]
            info = zf.getinfo(book_name)
            if info.file_size > MAX_BOOK_SIZE:
                raise BadInputError("Файл внутри ZIP слишком большой")
            ext = book_name.rsplit(".", 1)[-1].lower()
            filename_hint = os.path.basename(book_name)
            extracted = zf.read(book_name)
    except zipfile.BadZipFile:
        raise BadInputError("Повреждённый ZIP")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)
    return extracted, ext, filename_hint


async def _save_temp_book(content: bytes, temp_id: str, ext: str, temp_artifacts: list[str]) -> str:
    """Write book bytes to a temp file and register it in artifacts. Returns book_path."""
    book_path = _temp_book_path(temp_id, ext)
    await asyncio.to_thread(Path(book_path).write_bytes, content)
    temp_artifacts.append(book_path)
    return book_path


async def _save_cover_if_present(
    meta: ParsedMetadata, temp_id: str, temp_artifacts: list[str]
) -> str | None:
    """Write cover bytes to a temp file if present. Returns cover URL or None."""
    if not (meta.cover_data and meta.cover_ext):
        return None
    cover_path = _temp_cover_path(temp_id, meta.cover_ext)
    await asyncio.to_thread(Path(cover_path).write_bytes, meta.cover_data)
    temp_artifacts.append(cover_path)
    return f"/api/uploads/cover/{temp_id}"


def _cleanup_temp_artifacts(temp_artifacts: list[str]) -> None:
    """Remove temp files created during this upload attempt."""
    for path in temp_artifacts:
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError as e:
            log.warning("Failed to remove temp artifact %s: %s", path, e)


def _build_upload_response(
    meta: ParsedMetadata,
    temp_id: str,
    ext: str,
    cover_url: str | None,
    duplicate: DuplicateHit | None,
) -> UploadParseResponse:
    """Assemble UploadParseResponse from parsed metadata and upload context."""
    if meta.series_number:
        series_number_str = str(meta.series_number).rstrip("0").rstrip(".")
    else:
        series_number_str = ""
    return UploadParseResponse(
        tempId=temp_id,
        format=ext.upper(),
        metadata=CreateBookMetadata(
            title=meta.title,
            authors=", ".join(meta.authors),
            series=meta.series or "",
            seriesNumber=series_number_str,
            description=meta.description or "",
            language=meta.language or "",
            tags=", ".join(meta.genres),
            publisher=meta.publisher or "",
            pubDate=meta.pub_date or "",
            isbn=meta.isbn or "",
            coverUrl=cover_url,
        ),
        duplicate=duplicate,
    )


async def upload_and_parse(db: sqlite3.Connection, content: bytes, filename: str) -> UploadParseResponse:
    """Upload temp book file, parse metadata, check duplicates.

    Returns UploadParseResponse ready for JSON serialization.
    Rollback: cleans up temp artifacts created by this call on failure.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    temp_id = str(uuid.uuid4())[:8]
    filename_hint = filename
    temp_artifacts: list[str] = []

    # Self-healing orphan GC: снести старые temp'ы до того как положим свои.
    cleanup_old_uploads()

    try:
        # ZIP extraction (sync helper uses open()+zipfile — run off event loop)
        if ext == "zip":
            content, ext, filename_hint = await asyncio.to_thread(_extract_from_zip, content, temp_id)

        book_path = await _save_temp_book(content, temp_id, ext, temp_artifacts)

        # Parse + enrich (in thread pool to avoid blocking event loop)
        meta = await asyncio.to_thread(parse_book, book_path, ext)
        meta = await asyncio.to_thread(enrich_metadata, meta, ext, filename_hint, book_path)
        meta.genres = resolve_genres(db, meta.genres)

        cover_url = await _save_cover_if_present(meta, temp_id, temp_artifacts)
        duplicate = _check_duplicate(db, meta.title, meta.authors)
        response = _build_upload_response(meta, temp_id, ext, cover_url, duplicate)

    except BadInputError:
        # Domain validation error from _extract_from_zip — middleware → 400.
        raise
    except Exception:
        _cleanup_temp_artifacts(temp_artifacts)
        raise

    return response


def create_book(db: sqlite3.Connection, temp_id: str, metadata: CreateBookMetadata) -> int:
    """Create book from uploaded temp file.

    Returns book_id.
    Rollback: multi-file moves unwound via ExitStack — on exception inside the
    with-block both the book file and the optional cover roll back automatically.
    """
    title = metadata.title.strip()
    if not title:
        raise BadInputError("Title required")

    temp_file = find_temp_file(temp_id)
    if not temp_file:
        raise BadInputError("Temp file not found")

    ext = temp_file.rsplit(".", 1)[-1]

    series_number = None
    if metadata.seriesNumber:
        try:
            series_number = float(metadata.seriesNumber)
        except ValueError:
            pass

    author_ids = resolve_authors(db, metadata.authors)
    series_id = resolve_series(db, metadata.series)
    tag_ids = resolve_tags(db, metadata.tags)

    create_data: BookCreateData = {
        "title": title,
        "description": metadata.description or None,
        "language": metadata.language or None,
        "publisher": metadata.publisher or None,
        "pub_date": metadata.pubDate or None,
        "series_id": series_id,
        "series_number": series_number,
        "author_ids": author_ids,
        "tag_ids": tag_ids,
    }
    book_id = dal_create_book(db, create_data)

    book_dir, book_dst = book_dir_and_dst(book_id, ext)
    src = str(UPLOADS_DIR / temp_file)

    try:
        with ExitStack() as stack:
            stack.enter_context(move_with_rollback(src, book_dst))
            register_and_linearize(db, book_id, book_dst, ext)

            cover_files = find_temp_covers(temp_id)
            if cover_files:
                cover_src = str(UPLOADS_DIR / cover_files[0])
                cover_ext = cover_src.rsplit(".", 1)[-1]
                cover_dst = os.path.join(book_dir, f"cover.{cover_ext}")
                stack.enter_context(move_with_rollback(cover_src, cover_dst))
                update_cover_path(db, book_id, db_path_for(book_id, f"cover.{cover_ext}"))

            if metadata.isbn:
                add_book_identifier(db, book_id, "isbn", metadata.isbn)
    except Exception:
        # ExitStack rolled back the moves → book_dir is empty. Remove it, otherwise
        # library/ accumulates orphan dirs from failed create_book attempts: DAL
        # rollback releases the book_id for the next create, but the empty dir
        # stays around forever.
        if os.path.isdir(book_dir) and not os.listdir(book_dir):
            os.rmdir(book_dir)
        raise

    return book_id


def add_format(db: sqlite3.Connection, book_id: int, temp_id: str) -> str:
    """Add a format to an existing book from uploaded temp file.

    Returns format string (e.g. "PDF").
    Rollback: move_with_rollback removes dst on exception inside the with-block.
    """
    temp_file = find_temp_file(temp_id)
    if not temp_file:
        raise BadInputError("Temp file not found")

    ext = temp_file.rsplit(".", 1)[-1]
    fmt = ext.upper()
    dst = prepare_book_format_path(db, book_id, fmt, ext)
    src = str(UPLOADS_DIR / temp_file)

    with move_with_rollback(src, dst):
        register_and_linearize(db, book_id, dst, ext)

    cleanup_temp_session(temp_id)
    return fmt


def _check_duplicate(db: sqlite3.Connection, title: str, authors: list[str]) -> DuplicateHit | None:
    if not title:
        return None
    rows = find_duplicates_by_title(db, title)
    for r in rows:
        if not authors:
            if r["title"].lower() == title.lower():
                return r
            continue
        r_author_names = [a.name.lower() for a in r["authors"]]
        if any(a.lower() in name for a in authors for name in r_author_names):
            return r
    return None
