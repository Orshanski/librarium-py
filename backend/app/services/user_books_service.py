"""Per-user book state: rating, read-flag, hidden-flag."""
import sqlite3

from ..dal import user_books as dal


def set_rating(db: sqlite3.Connection, user_id: int, book_id: int, rating: int | None) -> None:
    dal.set_rating(db, user_id, book_id, rating)


def set_read(db: sqlite3.Connection, user_id: int, book_id: int, is_read: bool) -> None:
    dal.set_read(db, user_id, book_id, int(is_read))


def set_hidden(db: sqlite3.Connection, user_id: int, book_id: int, is_hidden: bool) -> None:
    dal.set_hidden(db, user_id, book_id, int(is_hidden))
