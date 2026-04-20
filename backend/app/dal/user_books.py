import sqlite3
from pathlib import Path
from typing import cast

import aiosql

from ..database import dict_from_row
from ..dtos.user_books import UserBookRow

queries = aiosql.from_path(Path(__file__).parent / "queries" / "user_books", "sqlite3")


def get_user_book(db: sqlite3.Connection, user_id: int, book_id: int) -> UserBookRow | None:
    return cast(UserBookRow | None, dict_from_row(queries.get_user_book(db, uid=user_id, bid=book_id)))


def set_rating(db: sqlite3.Connection, user_id: int, book_id: int, rating: int | None) -> None:
    queries.set_rating(db, uid=user_id, bid=book_id, r=rating)

    # "Лучшее" -- динамический фильтр в get_shelf_by_id, shelf_books не используется


def set_read(db: sqlite3.Connection, user_id: int, book_id: int, is_read: int) -> None:
    queries.set_read(db, uid=user_id, bid=book_id, r=is_read)


def set_hidden(db: sqlite3.Connection, user_id: int, book_id: int, is_hidden: int) -> None:
    queries.set_hidden(db, uid=user_id, bid=book_id, h=is_hidden)
