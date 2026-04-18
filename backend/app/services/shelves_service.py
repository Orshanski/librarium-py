"""Service-layer для shelves: raise NotFoundError на отсутствующие shelves."""
import sqlite3
from typing import TypedDict

from ..dal import shelves as dal
from ..exceptions import NotFoundError


class _BookShelfEntry(TypedDict):
    id: int
    has_book: bool


class ShelvesList(TypedDict, total=False):
    shelves: list[dict]
    bookShelves: list[_BookShelfEntry]


def list_shelves(db: sqlite3.Connection, user_id: int, book_id: int | None) -> ShelvesList:
    shelves = dal.get_shelves(db, user_id)
    result: ShelvesList = {"shelves": shelves}
    if book_id is not None:
        on_shelf_ids = dal.get_book_shelf_ids(db, book_id, user_id)
        result["bookShelves"] = [
            {"id": s["id"], "has_book": s["id"] in on_shelf_ids} for s in shelves
        ]
    return result


def create_shelf(db: sqlite3.Connection, user_id: int, name: str) -> int:
    return dal.create_shelf(db, user_id, name)


def get_shelf(db: sqlite3.Connection, shelf_id: int, user_id: int) -> dict:
    result = dal.get_shelf_by_id(db, shelf_id, user_id)
    if not result:
        raise NotFoundError("Not found")
    return result


def update_shelf(db: sqlite3.Connection, shelf_id: int, user_id: int, name: str) -> None:
    if not dal.shelf_exists(db, shelf_id, user_id):
        raise NotFoundError("Not found")
    dal.update_shelf(db, shelf_id, name)


def delete_shelf(db: sqlite3.Connection, shelf_id: int, user_id: int) -> None:
    if not dal.shelf_exists(db, shelf_id, user_id):
        raise NotFoundError("Not found")
    dal.delete_shelf(db, shelf_id)


def add_book(db: sqlite3.Connection, shelf_id: int, user_id: int, book_id: int) -> None:
    if not dal.shelf_exists(db, shelf_id, user_id):
        raise NotFoundError("Not found")
    dal.add_book_to_shelf(db, shelf_id, book_id)


def remove_book(db: sqlite3.Connection, shelf_id: int, user_id: int, book_id: int) -> None:
    if not dal.shelf_exists(db, shelf_id, user_id):
        raise NotFoundError("Not found")
    dal.remove_book_from_shelf(db, shelf_id, book_id)
