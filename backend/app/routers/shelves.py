import logging
import sqlite3

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from ..auth import get_current_user
from ..database import db_session

log = logging.getLogger("librarium.shelves")
from ..dal import shelves as dal

router = APIRouter(prefix="/api/shelves", tags=["shelves"])


class ShelfBody(BaseModel):
    name: str


class ShelfBookBody(BaseModel):
    bookId: int


@router.get("")
def list_shelves(request: Request, db: sqlite3.Connection = Depends(db_session), bookId: int | None = None):
    user = get_current_user(request)
    dal.ensure_system_shelves(db, user["userId"])
    shelves = dal.get_shelves(db, user["userId"])
    result: dict = {"shelves": shelves}
    if bookId is not None:
        on_shelf_ids = dal.get_book_shelf_ids(db, bookId, user["userId"])
        result["bookShelves"] = [{"id": s["id"], "has_book": s["id"] in on_shelf_ids} for s in shelves]
    return result


@router.post("")
def create_shelf(body: ShelfBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    shelf_id = dal.create_shelf(db, user["userId"], body.name)
    log.info("Created shelf=%s by user_id=%s", body.name, user["userId"])
    return {"id": shelf_id}


@router.get("/{shelf_id}")
def get_shelf(shelf_id: int, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    result = dal.get_shelf_by_id(db, shelf_id, user["userId"])
    if not result:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return result


@router.put("/{shelf_id}")
def update_shelf(shelf_id: int, body: ShelfBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    if not dal.get_shelf_by_id(db, shelf_id, user["userId"]):
        return JSONResponse({"error": "Not found"}, status_code=404)
    dal.update_shelf(db, shelf_id, body.name)
    return {"ok": True}


@router.delete("/{shelf_id}")
def delete_shelf(shelf_id: int, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    if not dal.get_shelf_by_id(db, shelf_id, user["userId"]):
        return JSONResponse({"error": "Not found"}, status_code=404)
    dal.delete_shelf(db, shelf_id)
    log.info("Deleted shelf=%d by user_id=%s", shelf_id, user["userId"])
    return {"ok": True}


@router.post("/{shelf_id}/books")
def add_book(shelf_id: int, body: ShelfBookBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    if not dal.get_shelf_by_id(db, shelf_id, user["userId"]):
        return JSONResponse({"error": "Not found"}, status_code=404)
    dal.add_book_to_shelf(db, shelf_id, body.bookId)
    return {"ok": True}


@router.delete("/{shelf_id}/books/{book_id}")
def remove_book(shelf_id: int, book_id: int, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    if not dal.get_shelf_by_id(db, shelf_id, user["userId"]):
        return JSONResponse({"error": "Not found"}, status_code=404)
    dal.remove_book_from_shelf(db, shelf_id, book_id)
    return {"ok": True}
