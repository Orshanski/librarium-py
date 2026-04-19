import logging
import sqlite3

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.shelves import ShelfBody, ShelfBookBody
from ..services import shelves_service

log = logging.getLogger("librarium.shelves")
router = APIRouter(prefix="/api/shelves", tags=["shelves"])


@router.get("")
def list_shelves(
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    bookId: int | None = None,
):
    return shelves_service.list_shelves(db, user.user_id, bookId)


@router.post("")
def create_shelf(body: ShelfBody, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    shelf_id = shelves_service.create_shelf(db, user.user_id, body.name)
    log.info("Created shelf=%s by user_id=%s", body.name, user.user_id)
    return {"id": shelf_id}


@router.get("/{shelf_id}")
def get_shelf(shelf_id: int, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    return shelves_service.get_shelf(db, shelf_id, user.user_id)


@router.put("/{shelf_id}")
def update_shelf(shelf_id: int, body: ShelfBody, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    shelves_service.update_shelf(db, shelf_id, user.user_id, body.name)
    return {"ok": True}


@router.delete("/{shelf_id}")
def delete_shelf(shelf_id: int, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    shelves_service.delete_shelf(db, shelf_id, user.user_id)
    log.info("Deleted shelf=%d by user_id=%s", shelf_id, user.user_id)
    return {"ok": True}


@router.post("/{shelf_id}/books")
def add_book(shelf_id: int, body: ShelfBookBody, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    shelves_service.add_book(db, shelf_id, user.user_id, body.bookId)
    return {"ok": True}


@router.delete("/{shelf_id}/books/{book_id}")
def remove_book(shelf_id: int, book_id: int, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    shelves_service.remove_book(db, shelf_id, user.user_id, book_id)
    return {"ok": True}
