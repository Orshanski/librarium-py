"""Service-layer для shelves: raise NotFoundError на отсутствующие shelves."""
import sqlite3

from ..dal import shelves as dal
from ..dtos.catalog import UserSort
from ..dtos.shelves import BookShelfEntry, ShelfDetailResponse, ShelfSummary, ShelvesListResponse
from ..exceptions import NotFoundError
from .book_item_builder import row_to_book_card_item

_NOT_FOUND = "Not found"


def list_shelves(db: sqlite3.Connection, user_id: int, book_id: int | None) -> ShelvesListResponse:
    shelves = dal.get_shelves(db, user_id)
    book_shelves = None
    if book_id is not None:
        on_shelf_ids = dal.get_book_shelf_ids(db, book_id, user_id)
        book_shelves = [
            BookShelfEntry(id=s["id"], has_book=s["id"] in on_shelf_ids) for s in shelves
        ]
    return ShelvesListResponse(shelves=shelves, book_shelves=book_shelves)


def create_shelf(db: sqlite3.Connection, user_id: int, name: str) -> int:
    return dal.create_shelf(db, user_id, name)


def get_shelf(
    db: sqlite3.Connection,
    shelf_id: int,
    user_id: int,
    sort: UserSort,
) -> ShelfDetailResponse:
    result = dal.get_shelf_by_id(db, shelf_id, user_id, sort)
    if not result:
        raise NotFoundError(_NOT_FOUND)
    shelf_row = result["shelf"]
    return ShelfDetailResponse(
        shelf=ShelfSummary(
            id=shelf_row["id"],
            name=shelf_row["name"],
            is_system=bool(shelf_row["is_system"]),
            system_code=shelf_row["system_code"],
        ),
        books=[row_to_book_card_item(r) for r in result["books"]],
    )


def update_shelf(db: sqlite3.Connection, shelf_id: int, user_id: int, name: str) -> None:
    if not dal.shelf_exists(db, shelf_id, user_id):
        raise NotFoundError(_NOT_FOUND)
    dal.update_shelf(db, shelf_id, name)


def update_shelf_changed(db: sqlite3.Connection, shelf_id: int, user_id: int, name: str) -> bool:
    shelf = dal.get_shelf_meta(db, shelf_id, user_id)
    if not shelf:
        raise NotFoundError(_NOT_FOUND)
    if shelf["is_system"] or shelf["name"] == name:
        return False
    dal.update_shelf(db, shelf_id, name)
    return True


def delete_shelf(db: sqlite3.Connection, shelf_id: int, user_id: int) -> None:
    if not dal.shelf_exists(db, shelf_id, user_id):
        raise NotFoundError(_NOT_FOUND)
    dal.delete_shelf(db, shelf_id)


def delete_shelf_changed(db: sqlite3.Connection, shelf_id: int, user_id: int) -> bool:
    shelf = dal.get_shelf_meta(db, shelf_id, user_id)
    if not shelf:
        raise NotFoundError(_NOT_FOUND)
    if shelf["is_system"]:
        return False
    dal.delete_shelf(db, shelf_id)
    return True


def add_book(db: sqlite3.Connection, shelf_id: int, user_id: int, book_id: int) -> None:
    if not dal.shelf_exists(db, shelf_id, user_id):
        raise NotFoundError(_NOT_FOUND)
    dal.add_book_to_shelf(db, shelf_id, book_id)


def add_book_changed(db: sqlite3.Connection, shelf_id: int, user_id: int, book_id: int) -> bool:
    shelf = dal.get_shelf_meta(db, shelf_id, user_id)
    if not shelf:
        raise NotFoundError(_NOT_FOUND)
    if shelf["is_system"]:
        dal.add_book_to_shelf(db, shelf_id, book_id)
        return False
    if shelf_id in dal.get_book_shelf_ids(db, book_id, user_id):
        return False
    dal.add_book_to_shelf(db, shelf_id, book_id)
    return True


def remove_book(db: sqlite3.Connection, shelf_id: int, user_id: int, book_id: int) -> None:
    if not dal.shelf_exists(db, shelf_id, user_id):
        raise NotFoundError(_NOT_FOUND)
    dal.remove_book_from_shelf(db, shelf_id, book_id)


def remove_book_changed(db: sqlite3.Connection, shelf_id: int, user_id: int, book_id: int) -> bool:
    shelf = dal.get_shelf_meta(db, shelf_id, user_id)
    if not shelf:
        raise NotFoundError(_NOT_FOUND)
    if shelf["is_system"]:
        dal.remove_book_from_shelf(db, shelf_id, book_id)
        return False
    if shelf_id not in dal.get_book_shelf_ids(db, book_id, user_id):
        return False
    dal.remove_book_from_shelf(db, shelf_id, book_id)
    return True
