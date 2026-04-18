import sqlite3
from ..database import dict_from_row


def get_user_book(db: sqlite3.Connection, user_id: int, book_id: int):
    return dict_from_row(db.execute(
        "SELECT * FROM user_books WHERE user_id = :uid AND book_id = :bid",
        {"uid": user_id, "bid": book_id},
    ).fetchone())


def set_rating(db: sqlite3.Connection, user_id: int, book_id: int, rating: int | None):
    db.execute("""
        INSERT INTO user_books (user_id, book_id, rating) VALUES (:uid, :bid, :r)
        ON CONFLICT(user_id, book_id) DO UPDATE SET rating = :r
    """, {"uid": user_id, "bid": book_id, "r": rating})

    # "Лучшее" -- динамический фильтр в get_shelf_by_id, shelf_books не используется


def set_read(db: sqlite3.Connection, user_id: int, book_id: int, is_read: int):
    db.execute("""
        INSERT INTO user_books (user_id, book_id, is_read) VALUES (:uid, :bid, :r)
        ON CONFLICT(user_id, book_id) DO UPDATE SET is_read = :r
    """, {"uid": user_id, "bid": book_id, "r": is_read})


def set_hidden(db: sqlite3.Connection, user_id: int, book_id: int, is_hidden: int):
    db.execute("""
        INSERT INTO user_books (user_id, book_id, is_hidden) VALUES (:uid, :bid, :h)
        ON CONFLICT(user_id, book_id) DO UPDATE SET is_hidden = :h
    """, {"uid": user_id, "bid": book_id, "h": is_hidden})
