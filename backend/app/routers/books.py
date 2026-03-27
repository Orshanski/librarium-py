import os
import shutil
from fastapi import APIRouter, Request, UploadFile, File
from fastapi.responses import JSONResponse
from ..auth import get_current_user, require_admin
from ..config import LIBRARY_DIR, DATA_DIR, MAX_BOOK_SIZE
from ..database import get_db
from ..dal import books as dal

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("")
def list_books(request: Request, sort: str = "added_desc", cursor: int = 0, pageSize: int = 50,
               authorIds: str = "", tagIds: str = "", seriesIds: str = "", language: str = ""):
    user = get_current_user(request)
    filters = {"userId": user["userId"]}
    if authorIds:
        filters["authorIds"] = [int(x) for x in authorIds.split(",") if x.strip().isdigit()]
    if tagIds:
        filters["tagIds"] = [int(x) for x in tagIds.split(",") if x.strip().isdigit()]
    if seriesIds:
        filters["seriesIds"] = [int(x) for x in seriesIds.split(",") if x.strip().isdigit()]
    if language:
        filters["language"] = language
    return dal.get_books(filters, sort, cursor, pageSize)


@router.get("/{book_id}")
def get_book(book_id: int, request: Request):
    user = get_current_user(request)
    book = dal.get_book_by_id(book_id, user["userId"])
    if not book:
        return JSONResponse({"error": "Not found"}, status_code=404)
    files = dal.get_book_files(book_id)
    identifiers = dal.get_book_identifiers(book_id)
    return {"book": book, "files": files, "identifiers": identifiers}


@router.put("/{book_id}")
async def update_book(book_id: int, request: Request):
    from ..dal.authors import get_or_create_author
    from ..dal.series import get_or_create_series
    from ..dal.tags import get_or_create_tag
    require_admin(request)
    data = await request.json()

    # Resolve string names to IDs
    if "authorIds" in data:
        data["authorIds"] = [get_or_create_author(a) if isinstance(a, str) else a for a in data["authorIds"]]
    if "tagIds" in data:
        data["tagIds"] = [get_or_create_tag(t) if isinstance(t, str) else t for t in data["tagIds"]]
    if "seriesId" in data and isinstance(data["seriesId"], str):
        data["seriesId"] = get_or_create_series(data["seriesId"])

    dal.update_book(book_id, data)
    return {"ok": True}


@router.post("/{book_id}/files")
async def upload_file(book_id: int, request: Request, file: UploadFile = File(...)):
    require_admin(request)
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    allowed = {"fb2", "epub", "pdf"}
    if ext not in allowed:
        return JSONResponse({"error": f"Unsupported format: {ext}"}, status_code=400)
    fmt = ext.upper()
    db = get_db()
    existing = db.execute("SELECT id FROM book_files WHERE book_id = ? AND format = ?", (book_id, fmt)).fetchone()
    if existing:
        return JSONResponse({"error": f"Формат {fmt} уже есть"}, status_code=409)
    content = await file.read()
    if len(content) > MAX_BOOK_SIZE:
        return JSONResponse({"error": "Файл слишком большой"}, status_code=400)
    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)
    file_path = os.path.join(book_dir, f"book.{ext}")
    with open(file_path, "wb") as f:
        f.write(content)
    db.execute(
        "INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (?, ?, ?, ?)",
        (book_id, fmt, f"data/library/{book_id}/book.{ext}", len(content)),
    )
    db.commit()
    return {"ok": True, "format": fmt, "size": len(content)}


@router.delete("/{book_id}/files")
def delete_file(book_id: int, request: Request, format: str = ""):
    require_admin(request)
    fmt = format.upper()
    if not fmt:
        return JSONResponse({"error": "format required"}, status_code=400)
    db = get_db()
    row = db.execute("SELECT id, file_path FROM book_files WHERE book_id = ? AND format = ?", (book_id, fmt)).fetchone()
    if not row:
        return JSONResponse({"error": "Not found"}, status_code=404)
    file_path = str(LIBRARY_DIR / str(book_id) / f"book.{fmt.lower()}")
    if os.path.isfile(file_path):
        os.remove(file_path)
    db.execute("DELETE FROM book_files WHERE id = ?", (dict(row)["id"],))
    db.commit()
    return {"ok": True}


@router.delete("/{book_id}")
def delete_book(book_id: int, request: Request):
    require_admin(request)

    # Delete files from disk
    book_dir = str(LIBRARY_DIR / str(book_id))
    if os.path.isdir(book_dir):
        shutil.rmtree(book_dir)

    # Delete thumb
    thumb = str(DATA_DIR / "thumbs" / f"{book_id}.jpg")
    if os.path.exists(thumb):
        os.remove(thumb)

    # Delete from DB (CASCADE handles book_authors, book_tags, book_files, etc.)
    dal.delete_book(book_id)
    return {"ok": True}
