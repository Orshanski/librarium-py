import asyncio
import logging
import os
import re
import uuid
import shutil
import zipfile
from fastapi import APIRouter, Request, UploadFile, File
from fastapi.responses import FileResponse, Response, JSONResponse

from pydantic import BaseModel, Field
from ..auth import require_admin

log = logging.getLogger("librarium.upload")
from ..config import UPLOADS_DIR, LIBRARY_DIR, MAX_BOOK_SIZE, db_path_for
from ..database import get_db
from ..parsers import parse_book
from ..enrichers import enrich_metadata
from ..pdf_linearize import linearize_pdf_in_place
from ..dal.books import create_book, get_book_files
from ..dal.authors import get_or_create_author
from ..dal.series import get_or_create_series
from ..dal.tags import get_or_create_tag

router = APIRouter(tags=["upload"])

BOOK_EXTENSIONS = {"fb2", "epub", "pdf"}


class CreateBookMetadata(BaseModel):
    title: str
    authors: str = ""
    series: str = ""
    seriesNumber: str = ""
    description: str = ""
    language: str = ""
    tags: str = ""
    publisher: str = ""
    pubDate: str = ""
    isbn: str = ""
    coverUrl: str | None = None


class CreateBookBody(BaseModel):
    tempId: str = Field(min_length=1, max_length=20, pattern=r'^[a-zA-Z0-9]+$')
    metadata: CreateBookMetadata = Field(default_factory=CreateBookMetadata)


class AddFormatBody(BaseModel):
    tempId: str = Field(min_length=1, max_length=20, pattern=r'^[a-zA-Z0-9]+$')


@router.post("/api/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    user = require_admin(request)

    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in BOOK_EXTENSIONS and ext != "zip":
        return JSONResponse({"error": f"Unsupported format: {ext}"}, status_code=400)

    temp_id = str(uuid.uuid4())[:8]

    # Check size before reading into memory
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_BOOK_SIZE:
        return JSONResponse({"error": f"Файл слишком большой (макс. {MAX_BOOK_SIZE // 1024 // 1024} МБ)"}, status_code=400)

    content = await file.read()

    # filename_hint for LLM extraction — overridden to inner book name when extracted from ZIP
    filename_hint = filename

    # ZIP: extract single book file
    if ext == "zip":
        zip_path = str(UPLOADS_DIR / f"{temp_id}.zip")
        with open(zip_path, "wb") as f:
            f.write(content)
        try:
            with zipfile.ZipFile(zip_path) as zf:
                book_files = [n for n in zf.namelist() if n.rsplit(".", 1)[-1].lower() in BOOK_EXTENSIONS]
                if len(book_files) == 0:
                    os.remove(zip_path)
                    return JSONResponse({"error": "ZIP не содержит книг (fb2/epub/pdf)"}, status_code=400)
                if len(book_files) > 1:
                    os.remove(zip_path)
                    return JSONResponse({"error": f"ZIP содержит несколько книг: {', '.join(book_files)}"}, status_code=400)
                book_name = book_files[0]
                # Check decompressed size
                info = zf.getinfo(book_name)
                if info.file_size > MAX_BOOK_SIZE:
                    os.remove(zip_path)
                    return JSONResponse({"error": "Файл внутри ZIP слишком большой"}, status_code=400)
                ext = book_name.rsplit(".", 1)[-1].lower()
                # Use inner book name as hint for LLM — basename strips any zip-internal path
                filename_hint = os.path.basename(book_name)
                extracted = zf.read(book_name)
        except zipfile.BadZipFile:
            os.remove(zip_path)
            return JSONResponse({"error": "Повреждённый ZIP"}, status_code=400)
        os.remove(zip_path)
        content = extracted

    # Save book file
    book_path = str(UPLOADS_DIR / f"{temp_id}.{ext}")
    with open(book_path, "wb") as f:
        f.write(content)

    # Parse file structure (FB2/EPUB), then enrich with external sources (LLM for PDF)
    # Run in thread pool to avoid blocking event loop (LLM call can take 10-40s)
    meta = await asyncio.to_thread(parse_book, book_path, ext)
    meta = await asyncio.to_thread(enrich_metadata, meta, ext, filename_hint, book_path)

    # Save cover if extracted
    cover_url = None
    if meta.cover_data and meta.cover_ext:
        cover_path = str(UPLOADS_DIR / f"{temp_id}-cover.{meta.cover_ext}")
        with open(cover_path, "wb") as f:
            f.write(meta.cover_data)
        cover_url = f"/api/uploads/cover/{temp_id}"

    # Deduplication
    duplicate = _check_duplicate(meta.title, meta.authors)

    log.info("Uploaded temp_id=%s file=%s by user_id=%s", temp_id, filename, user["userId"])
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

def _validate_temp_id(temp_id: str) -> bool:
    return bool(re.match(r'^[a-zA-Z0-9]{1,20}$', temp_id))


def _find_temp_file(temp_id: str) -> str | None:
    """Find temp file by exact tempId match: {tempId}.{ext}"""
    pattern = re.compile(rf'^{re.escape(temp_id)}\.(\w+)$')
    for f in os.listdir(str(UPLOADS_DIR)):
        if pattern.match(f):
            return f
    return None


def _find_temp_covers(temp_id: str) -> list[str]:
    """Find temp cover files by exact tempId match: {tempId}-cover.{ext}"""
    pattern = re.compile(rf'^{re.escape(temp_id)}-cover\.(\w+)$')
    return [f for f in os.listdir(str(UPLOADS_DIR)) if pattern.match(f)]


@router.delete("/api/uploads/{temp_id}")
def cleanup_temp(temp_id: str, request: Request):
    require_admin(request)
    if not _validate_temp_id(temp_id):
        return JSONResponse({"error": "Invalid temp_id"}, status_code=400)
    book_file = _find_temp_file(temp_id)
    if book_file:
        os.remove(str(UPLOADS_DIR / book_file))
    for f in _find_temp_covers(temp_id):
        os.remove(str(UPLOADS_DIR / f))
    return {"ok": True}


@router.post("/api/books/create")
def create_book_from_upload(body: CreateBookBody, request: Request):
    user = require_admin(request)

    temp_id = body.tempId
    meta = body.metadata.model_dump()
    title = meta.get("title", "").strip()
    if not title:
        return JSONResponse({"error": "Title required"}, status_code=400)

    # Find temp file (exact match)
    temp_file = _find_temp_file(temp_id)
    if not temp_file:
        return JSONResponse({"error": "Temp file not found"}, status_code=400)

    ext = temp_file.rsplit(".", 1)[-1]
    fmt = ext.upper()

    series_number = None
    if meta.get("seriesNumber"):
        try:
            series_number = float(meta["seriesNumber"])
        except ValueError:
            pass

    db = get_db()
    book_dir = ""
    moved_paths: list[str] = []

    try:
        author_ids = [get_or_create_author(a.strip())
                      for a in meta.get("authors", "").split(",") if a.strip()]
        series_id = get_or_create_series(meta["series"].strip()) if meta.get("series", "").strip() else None
        tag_ids = [get_or_create_tag(t.strip())
                   for t in meta.get("tags", "").split(",") if t.strip()]

        book_id = create_book({
            "title": title,
            "description": meta.get("description") or None,
            "language": meta.get("language") or None,
            "publisher": meta.get("publisher") or None,
            "pubDate": meta.get("pubDate") or None,
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

        if ext == "pdf":
            linearize_pdf_in_place(dst_file)

        file_size = os.path.getsize(dst_file)
        db.execute(
            "INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (?, ?, ?, ?)",
            (book_id, fmt, db_path_for(book_id, f"book.{ext}"), file_size),
        )

        # Cover (exact match)
        cover_files = _find_temp_covers(temp_id)
        if cover_files:
            cover_src = str(UPLOADS_DIR / cover_files[0])
            cover_ext_name = cover_src.rsplit(".", 1)[-1]
            cover_dst = os.path.join(book_dir, f"cover.{cover_ext_name}")
            shutil.move(cover_src, cover_dst)
            moved_paths.append(cover_dst)
            db.execute("UPDATE books SET cover_path = ? WHERE id = ?",
                       (db_path_for(book_id, f"cover.{cover_ext_name}"), book_id))

        # ISBN
        if meta.get("isbn"):
            db.execute("INSERT INTO book_identifiers (book_id, type, value) VALUES (?, 'isbn', ?)",
                       (book_id, meta["isbn"]))

    except Exception:
        for path in moved_paths:
            if os.path.exists(path):
                os.remove(path)
        if book_dir and os.path.isdir(book_dir) and not os.listdir(book_dir):
            os.rmdir(book_dir)
        raise

    log.info("Created book=%d title=%s by user_id=%s", book_id, title, user["userId"])
    return {"bookId": book_id}


@router.post("/api/books/{book_id}/add-format")
def add_format(book_id: int, body: AddFormatBody, request: Request):
    user = require_admin(request)
    temp_id = body.tempId

    # Find temp file (exact match)
    temp_file = _find_temp_file(temp_id)
    if not temp_file:
        return JSONResponse({"error": "Temp file not found"}, status_code=400)

    ext = temp_file.rsplit(".", 1)[-1]
    fmt = ext.upper()

    db = get_db()

    # Проверить что книга существует
    if not db.execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone():
        return JSONResponse({"error": "Книга не найдена"}, status_code=404)

    existing = db.execute("SELECT id FROM book_files WHERE book_id = ? AND format = ?", (book_id, fmt)).fetchone()
    if existing:
        return JSONResponse({"error": f"Формат {fmt} уже есть"}, status_code=409)

    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)
    dst = ""

    try:
        src = str(UPLOADS_DIR / temp_file)
        dst = os.path.join(book_dir, f"book.{ext}")
        shutil.move(src, dst)

        if ext == "pdf":
            linearize_pdf_in_place(dst)

        file_size = os.path.getsize(dst)
        db.execute(
            "INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (?, ?, ?, ?)",
            (book_id, fmt, db_path_for(book_id, f"book.{ext}"), file_size),
        )
    except Exception:
        if dst and os.path.exists(dst):
            os.remove(dst)
        raise

    # Clean temp cover AFTER successful request (exact match)
    for f in _find_temp_covers(temp_id):
        os.remove(str(UPLOADS_DIR / f))

    log.info("Added format=%s book=%d by user_id=%s", fmt, book_id, user["userId"])
    return {"ok": True, "format": fmt}


def _check_duplicate(title: str, authors: list[str]) -> dict | None:
    if not title:
        return None
    db = get_db()
    escaped = title.lower().replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    rows = db.execute("""
        SELECT b.id, b.title, GROUP_CONCAT(DISTINCT a.name) as authors
        FROM books b
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        WHERE lower_utf8(b.title) LIKE ? ESCAPE '\\'
        GROUP BY b.id LIMIT 5
    """, (pattern,)).fetchall()

    for row in rows:
        r = dict(row)
        # Check if any author matches
        if authors:
            r_authors = (r["authors"] or "").lower()
            for a in authors:
                if a.lower() in r_authors:
                    return {"id": r["id"], "title": r["title"], "authors": r["authors"]}
        elif r["title"].lower() == title.lower():
            return {"id": r["id"], "title": r["title"], "authors": r["authors"]}

    return None
