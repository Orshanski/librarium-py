import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from ..auth import get_current_user

log = logging.getLogger("librarium.shelves")
from ..dal import shelves as dal

router = APIRouter(prefix="/api/shelves", tags=["shelves"])


class ShelfBody(BaseModel):
    name: str


class ShelfBookBody(BaseModel):
    bookId: int


@router.get("")
def list_shelves(request: Request, bookId: int | None = None):
    user = get_current_user(request)
    dal.ensure_system_shelf(user["userId"])
    shelves = dal.get_shelves(user["userId"])
    result: dict = {"shelves": shelves}
    if bookId is not None:
        from ..database import get_db
        db = get_db()
        rows = db.execute("""
            SELECT sb.shelf_id FROM shelf_books sb
            JOIN shelves s ON sb.shelf_id = s.id
            WHERE sb.book_id = ? AND s.user_id = ?
        """, (bookId, user["userId"])).fetchall()
        on_shelf_ids = {r["shelf_id"] for r in rows}
        result["bookShelves"] = [{"id": s["id"], "has_book": s["id"] in on_shelf_ids} for s in shelves]
    return result


@router.post("")
def create_shelf(body: ShelfBody, request: Request):
    user = get_current_user(request)
    shelf_id = dal.create_shelf(user["userId"], body.name)
    log.info("Created shelf=%s by user_id=%s", body.name, user["userId"])
    return {"id": shelf_id}


@router.get("/{shelf_id}")
def get_shelf(shelf_id: int, request: Request):
    user = get_current_user(request)
    result = dal.get_shelf_by_id(shelf_id, user["userId"])
    if not result:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return result


@router.put("/{shelf_id}")
def update_shelf(shelf_id: int, body: ShelfBody, request: Request):
    user = get_current_user(request)
    if not dal.get_shelf_by_id(shelf_id, user["userId"]):
        return JSONResponse({"error": "Not found"}, status_code=404)
    dal.update_shelf(shelf_id, body.name)
    return {"ok": True}


@router.delete("/{shelf_id}")
def delete_shelf(shelf_id: int, request: Request):
    user = get_current_user(request)
    if not dal.get_shelf_by_id(shelf_id, user["userId"]):
        return JSONResponse({"error": "Not found"}, status_code=404)
    dal.delete_shelf(shelf_id)
    log.info("Deleted shelf=%d by user_id=%s", shelf_id, user["userId"])
    return {"ok": True}


@router.post("/{shelf_id}/books")
def add_book(shelf_id: int, body: ShelfBookBody, request: Request):
    user = get_current_user(request)
    if not dal.get_shelf_by_id(shelf_id, user["userId"]):
        return JSONResponse({"error": "Not found"}, status_code=404)
    dal.add_book_to_shelf(shelf_id, body.bookId)
    return {"ok": True}


@router.delete("/{shelf_id}/books/{book_id}")
def remove_book(shelf_id: int, book_id: int, request: Request):
    user = get_current_user(request)
    if not dal.get_shelf_by_id(shelf_id, user["userId"]):
        return JSONResponse({"error": "Not found"}, status_code=404)
    dal.remove_book_from_shelf(shelf_id, book_id)
    return {"ok": True}
