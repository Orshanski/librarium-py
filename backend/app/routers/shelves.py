from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from ..auth import get_current_user
from ..dal import shelves as dal

router = APIRouter(prefix="/api/shelves", tags=["shelves"])


class ShelfBody(BaseModel):
    name: str


class ShelfBookBody(BaseModel):
    bookId: int


@router.get("")
def list_shelves(request: Request):
    user = get_current_user(request)
    dal.ensure_system_shelf(user["userId"])
    return {"shelves": dal.get_shelves(user["userId"])}


@router.post("")
def create_shelf(body: ShelfBody, request: Request):
    user = get_current_user(request)
    shelf_id = dal.create_shelf(user["userId"], body.name)
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
    get_current_user(request)
    dal.update_shelf(shelf_id, body.name)
    return {"ok": True}


@router.delete("/{shelf_id}")
def delete_shelf(shelf_id: int, request: Request):
    get_current_user(request)
    dal.delete_shelf(shelf_id)
    return {"ok": True}


@router.post("/{shelf_id}/books")
def add_book(shelf_id: int, body: ShelfBookBody, request: Request):
    get_current_user(request)
    dal.add_book_to_shelf(shelf_id, body.bookId)
    return {"ok": True}


@router.delete("/{shelf_id}/books/{book_id}")
def remove_book(shelf_id: int, book_id: int, request: Request):
    get_current_user(request)
    dal.remove_book_from_shelf(shelf_id, book_id)
    return {"ok": True}
