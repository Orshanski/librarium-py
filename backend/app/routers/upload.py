import os
import uuid
import glob
import shutil
import zipfile
from fastapi import APIRouter, Request, UploadFile, File
from fastapi.responses import FileResponse, Response, JSONResponse

from ..auth import require_admin
from ..config import UPLOADS_DIR, LIBRARY_DIR
from ..database import get_db
from ..parsers import parse_book
from ..dal.books import create_book, get_book_files
from ..dal.authors import get_or_create_author
from ..dal.series import get_or_create_series
from ..dal.tags import get_or_create_tag

router = APIRouter(tags=["upload"])

BOOK_EXTENSIONS = {"fb2", "epub", "pdf"}


@router.post("/api/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    require_admin(request)

    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in BOOK_EXTENSIONS and ext != "zip":
        return JSONResponse({"error": f"Unsupported format: {ext}"}, status_code=400)

    temp_id = str(uuid.uuid4())[:8]
    content = await file.read()

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
                ext = book_name.rsplit(".", 1)[-1].lower()
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

    # Parse
    meta = parse_book(book_path, ext)

    # Save cover if extracted
    cover_url = None
    if meta.cover_data and meta.cover_ext:
        cover_path = str(UPLOADS_DIR / f"{temp_id}-cover.{meta.cover_ext}")
        with open(cover_path, "wb") as f:
            f.write(meta.cover_data)
        cover_url = f"/api/uploads/cover/{temp_id}"

    # Deduplication
    duplicate = _check_duplicate(meta.title, meta.authors)

    return {
        "tempId": temp_id,
        "format": ext.upper(),
        "metadata": {
            "title": meta.title,
            "authors": ", ".join(meta.authors),
            "series": meta.series or "",
            "seriesNumber": str(int(meta.series_number)) if meta.series_number else "",
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

@router.delete("/api/uploads/{temp_id}")
def cleanup_temp(temp_id: str, request: Request):
    require_admin(request)
    for f in glob.glob(str(UPLOADS_DIR / f"{temp_id}.*")):
        os.remove(f)
    for f in glob.glob(str(UPLOADS_DIR / f"{temp_id}-cover.*")):
        os.remove(f)
    return {"ok": True}


@router.post("/api/books/create")
async def create_book_from_upload(request: Request):
    require_admin(request)
    data = await request.json()

    temp_id = data.get("tempId")
    if not temp_id:
        return JSONResponse({"error": "tempId required"}, status_code=400)

    meta = data.get("metadata", {})
    title = meta.get("title", "").strip()
    if not title:
        return JSONResponse({"error": "Title required"}, status_code=400)

    # Find temp file
    temp_file = None
    for f in os.listdir(str(UPLOADS_DIR)):
        if f.startswith(f"{temp_id}.") and not f.endswith("-cover." + f.rsplit(".", 1)[-1]):
            if not "-cover." in f:
                temp_file = f
                break
    if not temp_file:
        return JSONResponse({"error": "Temp file not found"}, status_code=400)

    ext = temp_file.rsplit(".", 1)[-1]
    fmt = ext.upper()

    # Create authors/series/tags
    author_ids = []
    for name in [a.strip() for a in meta.get("authors", "").split(",") if a.strip()]:
        author_ids.append(get_or_create_author(name))

    series_id = None
    if meta.get("series", "").strip():
        series_id = get_or_create_series(meta["series"].strip())

    tag_ids = []
    for name in [t.strip() for t in meta.get("tags", "").split(",") if t.strip()]:
        tag_ids.append(get_or_create_tag(name))

    series_number = None
    if meta.get("seriesNumber"):
        try:
            series_number = float(meta["seriesNumber"])
        except ValueError:
            pass

    # Create book in DB
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

    # Move file to library
    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)

    src_file = str(UPLOADS_DIR / temp_file)
    dst_file = os.path.join(book_dir, f"book.{ext}")
    shutil.move(src_file, dst_file)

    file_size = os.path.getsize(dst_file)

    # Insert book_files
    db = get_db()
    db.execute(
        "INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (?, ?, ?, ?)",
        (book_id, fmt, f"data/library/{book_id}/book.{ext}", file_size),
    )

    # Move cover if exists
    cover_files = glob.glob(str(UPLOADS_DIR / f"{temp_id}-cover.*"))
    if cover_files:
        cover_src = cover_files[0]
        cover_ext = cover_src.rsplit(".", 1)[-1]
        cover_dst = os.path.join(book_dir, f"cover.{cover_ext}")
        shutil.move(cover_src, cover_dst)
        db.execute("UPDATE books SET cover_path = ? WHERE id = ?",
                   (f"data/library/{book_id}/cover.{cover_ext}", book_id))

    # ISBN
    if meta.get("isbn"):
        db.execute("INSERT INTO book_identifiers (book_id, type, value) VALUES (?, 'isbn', ?)",
                   (book_id, meta["isbn"]))

    db.commit()

    return {"bookId": book_id}


@router.post("/api/books/{book_id}/add-format")
async def add_format(book_id: int, request: Request):
    require_admin(request)
    data = await request.json()
    temp_id = data.get("tempId")
    if not temp_id:
        return JSONResponse({"error": "tempId required"}, status_code=400)

    # Find temp file
    temp_file = None
    for f in os.listdir(str(UPLOADS_DIR)):
        if f.startswith(f"{temp_id}.") and "-cover." not in f:
            temp_file = f
            break
    if not temp_file:
        return JSONResponse({"error": "Temp file not found"}, status_code=400)

    ext = temp_file.rsplit(".", 1)[-1]
    fmt = ext.upper()

    db = get_db()
    existing = db.execute("SELECT id FROM book_files WHERE book_id = ? AND format = ?", (book_id, fmt)).fetchone()
    if existing:
        return JSONResponse({"error": f"Формат {fmt} уже есть"}, status_code=409)

    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)

    src = str(UPLOADS_DIR / temp_file)
    dst = os.path.join(book_dir, f"book.{ext}")
    shutil.move(src, dst)

    file_size = os.path.getsize(dst)
    db.execute(
        "INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (?, ?, ?, ?)",
        (book_id, fmt, f"data/library/{book_id}/book.{ext}", file_size),
    )
    db.commit()

    # Clean temp cover
    for f in glob.glob(str(UPLOADS_DIR / f"{temp_id}-cover.*")):
        os.remove(f)

    return {"ok": True, "format": fmt}


def _check_duplicate(title: str, authors: list[str]) -> dict | None:
    if not title:
        return None
    db = get_db()
    pattern = f"%{title.lower()}%"
    rows = db.execute("""
        SELECT b.id, b.title, GROUP_CONCAT(DISTINCT a.name) as authors
        FROM books b
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        WHERE lower_utf8(b.title) LIKE ?
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
