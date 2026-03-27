import os
from fastapi import APIRouter, Request
from ..auth import get_current_user, require_admin
from ..dal import books as dal

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("")
def list_books(request: Request, sort: str = "added_desc", cursor: int = 0, pageSize: int = 50,
               authorIds: str = "", tagIds: str = "", seriesIds: str = "", language: str = ""):
    user = get_current_user(request)
    filters = {"userId": user["userId"]}
    if authorIds:
        filters["authorIds"] = [int(x) for x in authorIds.split(",")]
    if tagIds:
        filters["tagIds"] = [int(x) for x in tagIds.split(",")]
    if seriesIds:
        filters["seriesIds"] = [int(x) for x in seriesIds.split(",")]
    if language:
        filters["language"] = language
    return dal.get_books(filters, sort, cursor, pageSize)


@router.get("/{book_id}")
def get_book(book_id: int, request: Request):
    user = get_current_user(request)
    book = dal.get_book_by_id(book_id, user["userId"])
    if not book:
        return {"error": "Not found"}, 404
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


@router.delete("/{book_id}")
def delete_book(book_id: int, request: Request):
    import shutil
    from ..config import LIBRARY_DIR, DATA_DIR
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
