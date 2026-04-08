import sqlite3
from ..database import dict_from_row, dicts_from_rows


def get_shelves(db: sqlite3.Connection, user_id: int):
    shelves = dicts_from_rows(db.execute("""
        SELECT sh.*, COUNT(sb.book_id) as book_count
        FROM shelves sh LEFT JOIN shelf_books sb ON sh.id = sb.shelf_id
        WHERE sh.user_id = :uid GROUP BY sh.id ORDER BY sh.is_system DESC, sh.name
    """, {"uid": user_id}).fetchall())
    # Fix count for system shelves (dynamic, not in shelf_books)
    for sh in shelves:
        if sh["system_code"] == "best":
            sh["book_count"] = db.execute(
                "SELECT COUNT(*) FROM user_books WHERE user_id = :uid AND rating >= 4",
                {"uid": user_id},
            ).fetchone()[0]
        elif sh["system_code"] == "reading_now":
            sh["book_count"] = db.execute("""
                SELECT COUNT(*) FROM reading_progress rp
                LEFT JOIN user_books ub ON rp.book_id = ub.book_id AND ub.user_id = :uid
                WHERE rp.user_id = :uid AND rp.position IS NOT NULL
                    AND (ub.is_read IS NULL OR ub.is_read != 1)
            """, {"uid": user_id}).fetchone()[0]
    return shelves


def get_shelf_by_id(db: sqlite3.Connection, shelf_id: int, user_id: int):
    shelf = dict_from_row(db.execute(
        "SELECT * FROM shelves WHERE id = :id AND user_id = :uid",
        {"id": shelf_id, "uid": user_id},
    ).fetchone())
    if not shelf:
        return None

    if shelf["system_code"] == "best":
        books = dicts_from_rows(db.execute("""
            SELECT b.*, s.name as series_name,
                GROUP_CONCAT(DISTINCT a.name) as authors,
                GROUP_CONCAT(DISTINCT t.name) as tags,
                ub.rating
            FROM books b
            JOIN user_books ub ON b.id = ub.book_id AND ub.user_id = :uid AND ub.rating >= 4
            LEFT JOIN series s ON b.series_id = s.id
            LEFT JOIN book_authors ba ON b.id = ba.book_id
            LEFT JOIN authors a ON ba.author_id = a.id
            LEFT JOIN book_tags bt ON b.id = bt.book_id
            LEFT JOIN tags t ON bt.tag_id = t.id
            GROUP BY b.id ORDER BY ub.rating DESC, b.title
        """, {"uid": user_id}).fetchall())
    elif shelf["system_code"] == "reading_now":
        books = dicts_from_rows(db.execute("""
            SELECT b.*, s.name as series_name,
                GROUP_CONCAT(DISTINCT a.name) as authors,
                GROUP_CONCAT(DISTINCT t.name) as tags,
                rp.fraction, rp.last_format, rp.last_read_at
            FROM books b
            JOIN reading_progress rp ON b.id = rp.book_id AND rp.user_id = :uid AND rp.position IS NOT NULL
            LEFT JOIN user_books ub ON b.id = ub.book_id AND ub.user_id = :uid
            LEFT JOIN series s ON b.series_id = s.id
            LEFT JOIN book_authors ba ON b.id = ba.book_id
            LEFT JOIN authors a ON ba.author_id = a.id
            LEFT JOIN book_tags bt ON b.id = bt.book_id
            LEFT JOIN tags t ON bt.tag_id = t.id
            WHERE (ub.is_read IS NULL OR ub.is_read != 1)
            GROUP BY b.id ORDER BY rp.last_read_at DESC
        """, {"uid": user_id}).fetchall())
    else:
        books = dicts_from_rows(db.execute("""
            SELECT b.*, s.name as series_name,
                GROUP_CONCAT(DISTINCT a.name) as authors,
                GROUP_CONCAT(DISTINCT t.name) as tags
            FROM books b
            JOIN shelf_books sb ON b.id = sb.book_id AND sb.shelf_id = :id
            LEFT JOIN series s ON b.series_id = s.id
            LEFT JOIN book_authors ba ON b.id = ba.book_id
            LEFT JOIN authors a ON ba.author_id = a.id
            LEFT JOIN book_tags bt ON b.id = bt.book_id
            LEFT JOIN tags t ON bt.tag_id = t.id
            GROUP BY b.id ORDER BY sb.added_at DESC
        """, {"id": shelf_id}).fetchall())

    return {"shelf": shelf, "books": books}


def shelf_exists(db: sqlite3.Connection, shelf_id: int, user_id: int) -> bool:
    row = db.execute(
        "SELECT 1 FROM shelves WHERE id = :id AND user_id = :uid",
        {"id": shelf_id, "uid": user_id},
    ).fetchone()
    return row is not None


def create_shelf(db: sqlite3.Connection, user_id: int, name: str) -> int:
    cur = db.execute("INSERT INTO shelves (name, user_id) VALUES (:n, :uid)", {"n": name, "uid": user_id})
    return cur.lastrowid


def update_shelf(db: sqlite3.Connection, shelf_id: int, name: str):
    db.execute("UPDATE shelves SET name = :n WHERE id = :id AND is_system = 0", {"n": name, "id": shelf_id})


def delete_shelf(db: sqlite3.Connection, shelf_id: int):
    db.execute("DELETE FROM shelves WHERE id = :id AND is_system = 0", {"id": shelf_id})


def add_book_to_shelf(db: sqlite3.Connection, shelf_id: int, book_id: int):
    db.execute("INSERT OR IGNORE INTO shelf_books (shelf_id, book_id) VALUES (:sid, :bid)", {"sid": shelf_id, "bid": book_id})


def remove_book_from_shelf(db: sqlite3.Connection, shelf_id: int, book_id: int):
    db.execute("DELETE FROM shelf_books WHERE shelf_id = :sid AND book_id = :bid", {"sid": shelf_id, "bid": book_id})



_SYSTEM_SHELVES = [
    {"name": "Лучшее", "system_code": "best"},
    {"name": "Читаю сейчас", "system_code": "reading_now"},
]


def ensure_system_shelves(db: sqlite3.Connection, user_id: int):
    """Ensure all system shelves exist for the user."""
    existing = {r["system_code"] for r in dicts_from_rows(
        db.execute("SELECT system_code FROM shelves WHERE user_id = :uid AND is_system = 1",
                   {"uid": user_id}).fetchall()
    ) if r.get("system_code")}
    for sh in _SYSTEM_SHELVES:
        if sh["system_code"] not in existing:
            db.execute(
                "INSERT INTO shelves (name, user_id, is_system, system_code) VALUES (:name, :uid, 1, :code)",
                {"name": sh["name"], "uid": user_id, "code": sh["system_code"]},
            )


def get_book_shelf_ids(db: sqlite3.Connection, book_id: int, user_id: int) -> set[int]:
    rows = db.execute("""
        SELECT sb.shelf_id FROM shelf_books sb
        JOIN shelves s ON sb.shelf_id = s.id
        WHERE sb.book_id = ? AND s.user_id = ?
    """, (book_id, user_id)).fetchall()
    return {r["shelf_id"] for r in rows}
