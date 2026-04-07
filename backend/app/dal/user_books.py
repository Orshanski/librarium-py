from ..database import get_db, dict_from_row


def get_user_book(user_id: int, book_id: int):
    db = get_db()
    return dict_from_row(db.execute(
        "SELECT * FROM user_books WHERE user_id = :uid AND book_id = :bid",
        {"uid": user_id, "bid": book_id},
    ).fetchone())


def set_rating(user_id: int, book_id: int, rating: int | None):
    db = get_db()
    db.execute("""
        INSERT INTO user_books (user_id, book_id, rating) VALUES (:uid, :bid, :r)
        ON CONFLICT(user_id, book_id) DO UPDATE SET rating = :r
    """, {"uid": user_id, "bid": book_id, "r": rating})

    # "Лучшее" — динамический фильтр в get_shelf_by_id, shelf_books не используется


def set_read(user_id: int, book_id: int, is_read: bool):
    db = get_db()
    db.execute("""
        INSERT INTO user_books (user_id, book_id, is_read) VALUES (:uid, :bid, :r)
        ON CONFLICT(user_id, book_id) DO UPDATE SET is_read = :r
    """, {"uid": user_id, "bid": book_id, "r": 1 if is_read else 0})


def set_hidden(user_id: int, book_id: int, is_hidden: bool):
    db = get_db()
    db.execute("""
        INSERT INTO user_books (user_id, book_id, is_hidden) VALUES (:uid, :bid, :h)
        ON CONFLICT(user_id, book_id) DO UPDATE SET is_hidden = :h
    """, {"uid": user_id, "bid": book_id, "h": 1 if is_hidden else 0})
