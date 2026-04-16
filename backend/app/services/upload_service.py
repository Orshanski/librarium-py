import asyncio
import logging
import os
import re
import shutil
import sqlite3
import uuid
import zipfile

from ..config import UPLOADS_DIR, LIBRARY_DIR, MAX_BOOK_SIZE, db_path_for
from ..parsers import parse_book
from ..enrichers import enrich_metadata, resolve_genres
from ..pdf_linearize import linearize_pdf_in_place
from ..dal.books import (
    create_book as dal_create_book, add_book_file, update_cover_path,
    add_book_identifier, book_exists, book_file_exists, find_duplicates_by_title,
)
from .entity_resolver import resolve_authors, resolve_tags, resolve_series

log = logging.getLogger("librarium.upload")

BOOK_EXTENSIONS = {"fb2", "epub", "pdf"}


def _maybe_linearize(path: str, ext: str) -> None:
    if ext == "pdf":
        linearize_pdf_in_place(path)


def find_temp_file(temp_id: str) -> str | None:
    """Find temp file by exact tempId match: {tempId}.{ext}"""
    pattern = re.compile(rf'^{re.escape(temp_id)}\.(\w+)$')
    for f in os.listdir(str(UPLOADS_DIR)):
        if pattern.match(f):
            return f
    return None


def find_temp_covers(temp_id: str) -> list[str]:
    """Find temp cover files by exact tempId match: {tempId}-cover.{ext}"""
    pattern = re.compile(rf'^{re.escape(temp_id)}-cover\.(\w+)$')
    return [f for f in os.listdir(str(UPLOADS_DIR)) if pattern.match(f)]


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
                raise ValueError("ZIP не содержит книг (fb2/epub/pdf)")
            if len(book_files) > 1:
                raise ValueError(f"ZIP содержит несколько книг: {', '.join(book_files)}")
            book_name = book_files[0]
            info = zf.getinfo(book_name)
            if info.file_size > MAX_BOOK_SIZE:
                raise ValueError("Файл внутри ZIP слишком большой")
            ext = book_name.rsplit(".", 1)[-1].lower()
            filename_hint = os.path.basename(book_name)
            extracted = zf.read(book_name)
    except zipfile.BadZipFile:
        raise ValueError("Повреждённый ZIP")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)
    return extracted, ext, filename_hint


async def upload_and_parse(db: sqlite3.Connection, content: bytes, filename: str) -> dict:
    """Upload temp book file, parse metadata, check duplicates.

    Returns response dict ready for JSON serialization.
    Rollback: cleans up temp artifacts created by this call on failure.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    temp_id = str(uuid.uuid4())[:8]
    filename_hint = filename
    temp_artifacts: list[str] = []

    try:
        # ZIP extraction
        if ext == "zip":
            content, ext, filename_hint = _extract_from_zip(content, temp_id)

        # Save temp book file
        book_path = str(UPLOADS_DIR / f"{temp_id}.{ext}")
        with open(book_path, "wb") as f:
            f.write(content)
        temp_artifacts.append(book_path)

        # Parse + enrich (in thread pool to avoid blocking event loop)
        meta = await asyncio.to_thread(parse_book, book_path, ext)
        meta = await asyncio.to_thread(enrich_metadata, meta, ext, filename_hint, book_path)
        meta.genres = resolve_genres(db, meta.genres)

        # Save cover if extracted
        cover_url = None
        if meta.cover_data and meta.cover_ext:
            cover_path = str(UPLOADS_DIR / f"{temp_id}-cover.{meta.cover_ext}")
            with open(cover_path, "wb") as f:
                f.write(meta.cover_data)
            temp_artifacts.append(cover_path)
            cover_url = f"/api/uploads/cover/{temp_id}"

        # Deduplication
        duplicate = _check_duplicate(db, meta.title, meta.authors)

    except ValueError:
        # ValueError from _extract_from_zip — re-raise for router to handle
        raise
    except Exception:
        for path in temp_artifacts:
            if os.path.exists(path):
                os.remove(path)
        raise

    return {
        "tempId": temp_id,
        "format": ext.upper(),
        "metadata": {
            "title": meta.title,
            "authors": ", ".join(meta.authors),
            "series": meta.series or "",
            "seriesNumber": str(meta.series_number).rstrip("0").rstrip(".") if meta.series_number else "",
            "description": meta.description or "",
            "language": meta.language or "",
            "tags": ", ".join(meta.genres),
            "publisher": meta.publisher or "",
            "pubDate": meta.pub_date or "",
            "isbn": meta.isbn or "",
            "coverUrl": cover_url,
        },
        "duplicate": duplicate,
    }


def create_book(db: sqlite3.Connection, temp_id: str, metadata: dict) -> int:
    """Create book from uploaded temp file.

    Returns book_id.
    Rollback: removes moved files + empty dir on failure.
    """
    title = metadata.get("title", "").strip()
    if not title:
        raise ValueError("Title required")

    temp_file = find_temp_file(temp_id)
    if not temp_file:
        raise ValueError("Temp file not found")

    ext = temp_file.rsplit(".", 1)[-1]
    fmt = ext.upper()

    series_number = None
    if metadata.get("seriesNumber"):
        try:
            series_number = float(metadata["seriesNumber"])
        except ValueError:
            pass

    book_dir = ""
    moved_paths: list[str] = []

    try:
        author_ids = resolve_authors(db, metadata.get("authors", ""))
        series_id = resolve_series(db, metadata.get("series", ""))
        tag_ids = resolve_tags(db, metadata.get("tags", ""))

        book_id = dal_create_book(db, {
            "title": title,
            "description": metadata.get("description") or None,
            "language": metadata.get("language") or None,
            "publisher": metadata.get("publisher") or None,
            "pubDate": metadata.get("pubDate") or None,
            "seriesId": series_id,
            "seriesNumber": series_number,
            "authorIds": author_ids,
            "tagIds": tag_ids,
        })

        # File operations
        book_dir = str(LIBRARY_DIR / str(book_id))
        os.makedirs(book_dir, exist_ok=True)

        src_file = str(UPLOADS_DIR / temp_file)
        dst_file = os.path.join(book_dir, f"book.{ext}")
        shutil.move(src_file, dst_file)
        moved_paths.append(dst_file)

        _maybe_linearize(dst_file, ext)

        file_size = os.path.getsize(dst_file)
        add_book_file(db, book_id, fmt, db_path_for(book_id, f"book.{ext}"), file_size)

        # Cover
        cover_files = find_temp_covers(temp_id)
        if cover_files:
            cover_src = str(UPLOADS_DIR / cover_files[0])
            cover_ext_name = cover_src.rsplit(".", 1)[-1]
            cover_dst = os.path.join(book_dir, f"cover.{cover_ext_name}")
            shutil.move(cover_src, cover_dst)
            moved_paths.append(cover_dst)
            update_cover_path(db, book_id, db_path_for(book_id, f"cover.{cover_ext_name}"))

        # ISBN
        if metadata.get("isbn"):
            add_book_identifier(db, book_id, "isbn", metadata["isbn"])

    except Exception:
        for path in moved_paths:
            if os.path.exists(path):
                os.remove(path)
        if book_dir and os.path.isdir(book_dir) and not os.listdir(book_dir):
            os.rmdir(book_dir)
        raise

    return book_id


def add_format(db: sqlite3.Connection, book_id: int, temp_id: str) -> str:
    """Add a format to an existing book from uploaded temp file.

    Returns format string (e.g. "PDF").
    Rollback: removes destination file on failure.
    """
    temp_file = find_temp_file(temp_id)
    if not temp_file:
        raise ValueError("Temp file not found")

    ext = temp_file.rsplit(".", 1)[-1]
    fmt = ext.upper()

    if not book_exists(db, book_id):
        raise LookupError("Книга не найдена")

    if book_file_exists(db, book_id, fmt):
        raise FileExistsError(f"Формат {fmt} уже есть")

    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)
    dst = ""

    try:
        src = str(UPLOADS_DIR / temp_file)
        dst = os.path.join(book_dir, f"book.{ext}")
        shutil.move(src, dst)

        _maybe_linearize(dst, ext)

        file_size = os.path.getsize(dst)
        add_book_file(db, book_id, fmt, db_path_for(book_id, f"book.{ext}"), file_size)
    except Exception:
        if dst and os.path.exists(dst):
            os.remove(dst)
        raise

    # Clean temp covers after success
    for f in find_temp_covers(temp_id):
        os.remove(str(UPLOADS_DIR / f))

    return fmt


def _check_duplicate(db: sqlite3.Connection, title: str, authors: list[str]) -> dict | None:
    if not title:
        return None
    rows = find_duplicates_by_title(db, title)
    for r in rows:
        hit = _row_as_hit(r)
        if not authors:
            if r["title"].lower() == title.lower():
                return hit
            continue
        r_authors = (r["authors"] or "").lower()
        if any(a.lower() in r_authors for a in authors):
            return hit
    return None


def _row_as_hit(r: dict) -> dict:
    return {"id": r["id"], "title": r["title"], "authors": r["authors"]}
