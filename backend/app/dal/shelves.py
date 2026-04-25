import sqlite3
from pathlib import Path
from typing import cast

import aiosql

from ..config.sort import SORT_CONFIG
from ..database import dict_from_row, dicts_from_rows
from ..dtos.shelves import ShelfBaseRow, ShelfDetailRow, ShelfRow
from ._parsers import parse_book_row_aggregates
from .sort import resolve_order_clause

queries = aiosql.from_path(Path(__file__).parent / "queries" / "shelves", "sqlite3")

_ORDER_CLAUSE_PLACEHOLDER = "{order_clause}"


def get_shelves(db: sqlite3.Connection, user_id: int) -> list[ShelfRow]:
    shelves = dicts_from_rows(queries.list_user_shelves(db, uid=user_id))
    # Fix count for system shelves (dynamic, not in shelf_books)
    for sh in shelves:
        if sh["system_code"] == "best":
            sh["book_count"] = queries.count_best_books(db, uid=user_id)["cnt"]
        elif sh["system_code"] == "reading_now":
            sh["book_count"] = queries.count_reading_now_books(db, uid=user_id)["cnt"]
    return cast(list[ShelfRow], shelves)


def get_shelf_by_id(
    db: sqlite3.Connection,
    shelf_id: int,
    user_id: int,
    sort: str,
) -> ShelfDetailRow | None:
    shelf = dict_from_row(queries.get_shelf_header(db, id=shelf_id, uid=user_id))
    if not shelf:
        return None

    # reading_now берёт default из shared-конфига (lastReadDesc) — user-переданный sort игнорируется
    if shelf["system_code"] == "reading_now":
        effective_sort = SORT_CONFIG["shelf_reading_now"]["default"]
    else:
        effective_sort = sort
    order_clause = resolve_order_clause(effective_sort)

    if shelf["system_code"] == "best":
        sql = queries.get_shelf_books_best.sql.replace(_ORDER_CLAUSE_PLACEHOLDER, order_clause)
        rows = db.execute(sql, {"uid": user_id}).fetchall()
    elif shelf["system_code"] == "reading_now":
        sql = queries.get_shelf_books_reading_now.sql.replace(_ORDER_CLAUSE_PLACEHOLDER, order_clause)
        rows = db.execute(sql, {"uid": user_id}).fetchall()
    else:
        sql = queries.get_shelf_books_regular.sql.replace(_ORDER_CLAUSE_PLACEHOLDER, order_clause)
        rows = db.execute(sql, {"id": shelf_id, "uid": user_id}).fetchall()

    books = dicts_from_rows(rows)
    for r in books:
        parse_book_row_aggregates(r)
    return cast(ShelfDetailRow, {"shelf": cast(ShelfBaseRow, shelf), "books": books})


def shelf_exists(db: sqlite3.Connection, shelf_id: int, user_id: int) -> bool:
    row = queries.shelf_exists(db, id=shelf_id, uid=user_id)
    return row is not None


def create_shelf(db: sqlite3.Connection, user_id: int, name: str) -> int:
    return queries.create_shelf(db, n=name, uid=user_id)


def update_shelf(db: sqlite3.Connection, shelf_id: int, name: str) -> None:
    queries.update_shelf(db, n=name, id=shelf_id)


def delete_shelf(db: sqlite3.Connection, shelf_id: int) -> None:
    queries.delete_shelf(db, id=shelf_id)


def add_book_to_shelf(db: sqlite3.Connection, shelf_id: int, book_id: int) -> None:
    queries.add_book_to_shelf(db, sid=shelf_id, bid=book_id)


def remove_book_from_shelf(db: sqlite3.Connection, shelf_id: int, book_id: int) -> None:
    queries.remove_book_from_shelf(db, sid=shelf_id, bid=book_id)


_SYSTEM_SHELVES = [
    {"name": "Лучшее", "system_code": "best"},
    {"name": "Читаю сейчас", "system_code": "reading_now"},
]


def ensure_system_shelves(db: sqlite3.Connection, user_id: int) -> None:
    """Ensure all system shelves exist for the user."""
    existing = {r["system_code"] for r in dicts_from_rows(
        queries.get_existing_system_shelves(db, uid=user_id)
    ) if r.get("system_code")}
    for sh in _SYSTEM_SHELVES:
        if sh["system_code"] not in existing:
            queries.insert_system_shelf(db, name=sh["name"], uid=user_id, code=sh["system_code"])


def get_book_shelf_ids(db: sqlite3.Connection, book_id: int, user_id: int) -> set[int]:
    rows = queries.get_book_shelf_ids(db, book_id=book_id, user_id=user_id)
    return {r["shelf_id"] for r in rows}
