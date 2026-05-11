"""Per-user book state: rating, read-flag, hidden-flag."""
import sqlite3

from ..dal import reader as reader_dal
from ..dal import user_books as dal


def set_rating(db: sqlite3.Connection, user_id: int, book_id: int, rating: int | None) -> None:
    dal.set_rating(db, user_id, book_id, rating)


def set_rating_changed(db: sqlite3.Connection, user_id: int, book_id: int, rating: int | None) -> bool:
    current = dal.get_user_book(db, user_id, book_id)
    if current is None and rating is None:
        return False
    if current is not None and current["rating"] == rating:
        return False
    dal.set_rating(db, user_id, book_id, rating)
    return True


def set_read(db: sqlite3.Connection, user_id: int, book_id: int, is_read: bool) -> None:
    value = int(is_read)
    dal.set_read(db, user_id, book_id, value)
    if value:
        reader_dal.delete_reading_progress(db, user_id, book_id)


def set_read_changed(db: sqlite3.Connection, user_id: int, book_id: int, is_read: bool) -> bool:
    value = int(is_read)
    current = dal.get_user_book(db, user_id, book_id)
    current_value = 0 if current is None or current["is_read"] is None else current["is_read"]
    if current_value == value:
        if value:
            reader_dal.delete_reading_progress(db, user_id, book_id)
        return False
    set_read(db, user_id, book_id, is_read)
    return True


def set_hidden(db: sqlite3.Connection, user_id: int, book_id: int, is_hidden: bool) -> None:
    dal.set_hidden(db, user_id, book_id, int(is_hidden))


def set_hidden_changed(db: sqlite3.Connection, user_id: int, book_id: int, is_hidden: bool) -> bool:
    value = int(is_hidden)
    current = dal.get_user_book(db, user_id, book_id)
    current_value = 0 if current is None or current["is_hidden"] is None else current["is_hidden"]
    if current_value == value:
        return False
    dal.set_hidden(db, user_id, book_id, value)
    return True
