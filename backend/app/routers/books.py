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
    require_admin(request)
    data = await request.json()
    dal.update_book(book_id, data)
    return {"ok": True}
