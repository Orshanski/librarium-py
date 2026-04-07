from ..database import get_db, dicts_from_rows, dict_from_row
from .filters import build_book_where, get_filter_options


ORDER = {
    "title_asc": "ORDER BY COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC, b.id",
    "title_desc": "ORDER BY COALESCE(b.sort_title, b.title) COLLATE NOCASE DESC, b.id",
    "author_asc": "ORDER BY (SELECT a.sort_name FROM authors a JOIN book_authors ba ON a.id = ba.author_id WHERE ba.book_id = b.id LIMIT 1) COLLATE NOCASE ASC, b.id",
    "rating_desc": "ORDER BY (SELECT rating FROM user_books WHERE user_id = :uid AND book_id = b.id) DESC NULLS LAST, b.id",
    "added_desc": "ORDER BY b.added_at DESC, b.id",
}


def get_books(filters: dict, sort="added_desc", cursor=0, page_size=50):
    db = get_db()
    where, params = build_book_where(filters)
    uid = filters.get("userId")
    ub_join = f"AND ub.user_id = :uid" if uid else "AND 0"
    order = ORDER.get(sort, ORDER["added_desc"])
    if sort == "rating_desc" and not uid:
        order = ORDER["added_desc"]

    params.update(lim=page_size + 1, off=cursor)
    if uid:
        params["uid"] = uid

    rows = db.execute(f"""
        SELECT b.*, s.name as series_name,
            GROUP_CONCAT(DISTINCT a.name) as authors,
            GROUP_CONCAT(DISTINCT a.id) as author_ids,
            GROUP_CONCAT(DISTINCT t.name) as tags,
            GROUP_CONCAT(DISTINCT t.id) as tag_ids,
            ub.rating, ub.is_read
        FROM books b
        LEFT JOIN series s ON b.series_id = s.id
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        LEFT JOIN book_tags bt ON b.id = bt.book_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        LEFT JOIN user_books ub ON b.id = ub.book_id {ub_join}
        {where} GROUP BY b.id {order} LIMIT :lim OFFSET :off
    """, params).fetchall()

    books = dicts_from_rows(rows)
    has_more = len(books) > page_size
    if has_more:
        books = books[:page_size]

    return {
        "books": books,
        "filterOptions": {
            "authors": get_filter_options(filters, "author"),
            "series": get_filter_options(filters, "series"),
            "tags": get_filter_options(filters, "tag"),
            "languages": get_filter_options(filters, "language"),
        },
        "hasMore": has_more,
    }


def get_book_by_id(book_id: int, user_id: int | None = None):
    db = get_db()
    ub_join = "AND ub.user_id = :uid" if user_id else "AND 0"
    row = db.execute(f"""
        SELECT b.*, s.name as series_name,
            GROUP_CONCAT(DISTINCT a.name) as authors,
            GROUP_CONCAT(DISTINCT a.id) as author_ids,
            GROUP_CONCAT(DISTINCT t.name) as tags,
            GROUP_CONCAT(DISTINCT t.id) as tag_ids,
            ub.rating, ub.is_read
        FROM books b
        LEFT JOIN series s ON b.series_id = s.id
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        LEFT JOIN book_tags bt ON b.id = bt.book_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        LEFT JOIN user_books ub ON b.id = ub.book_id {ub_join}
        WHERE b.id = :id GROUP BY b.id
    """, {"id": book_id, "uid": user_id or 0}).fetchone()
    return dict_from_row(row)


def get_book_files(book_id: int):
    db = get_db()
    return dicts_from_rows(db.execute(
        "SELECT id, format, file_path, file_size FROM book_files WHERE book_id = :id", {"id": book_id}
    ).fetchall())


def get_book_identifiers(book_id: int):
    db = get_db()
    return dicts_from_rows(db.execute(
        "SELECT type, value FROM book_identifiers WHERE book_id = :id", {"id": book_id}
    ).fetchall())


def get_all_languages():
    """Language directory: [{name}, ...] sorted alphabetically."""
    db = get_db()
    return [{"name": r["language"]} for r in db.execute(
        "SELECT DISTINCT language FROM books WHERE language IS NOT NULL ORDER BY language COLLATE NOCASE"
    ).fetchall()]


def get_all_publishers():
    """Publisher directory: sorted alphabetically."""
    db = get_db()
    return [r["publisher"] for r in db.execute(
        "SELECT DISTINCT publisher FROM books WHERE publisher IS NOT NULL AND publisher != '' ORDER BY publisher COLLATE NOCASE"
    ).fetchall()]


def _sort_title(title: str) -> str:
    import re
    return re.sub(r"^(The|A|An)\s+", "", title, flags=re.IGNORECASE)


def create_book(data: dict) -> int:
    db = get_db()
    cur = db.execute("""
        INSERT INTO books (title, sort_title, description, language, publisher, pub_date, series_id, series_number, cover_path)
        VALUES (:title, :sort_title, :description, :language, :publisher, :pub_date, :series_id, :series_number, :cover_path)
    """, {
        "title": data["title"],
        "sort_title": data.get("sortTitle") or _sort_title(data["title"]),
        "description": data.get("description"),
        "language": data.get("language"),
        "publisher": data.get("publisher"),
        "pub_date": data.get("pubDate"),
        "series_id": data.get("seriesId"),
        "series_number": data.get("seriesNumber"),
        "cover_path": data.get("coverPath"),
    })
    book_id = cur.lastrowid
    for aid in data.get("authorIds", []):
        db.execute("INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES (?, ?)", (book_id, aid))
    for tid in data.get("tagIds", []):
        db.execute("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)", (book_id, tid))
    return book_id


def update_book(book_id: int, data: dict):
    db = get_db()
    sets = ["updated_at = CURRENT_TIMESTAMP"]
    params = {"id": book_id}

    field_map = {
        "title": "title", "description": "description", "language": "language",
        "publisher": "publisher", "pubDate": "pub_date", "seriesId": "series_id",
        "seriesNumber": "series_number", "coverPath": "cover_path",
    }
    for key, col in field_map.items():
        if key in data:
            sets.append(f"{col} = :{key}")
            params[key] = data[key]

    if "title" in data:
        sets.append("sort_title = :sortTitle")
        params["sortTitle"] = data.get("sortTitle") or _sort_title(data["title"])

    db.execute(f"UPDATE books SET {', '.join(sets)} WHERE id = :id", params)

    if "authorIds" in data:
        db.execute("DELETE FROM book_authors WHERE book_id = ?", (book_id,))
        for aid in data["authorIds"]:
            db.execute("INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES (?, ?)", (book_id, aid))

    if "tagIds" in data:
        db.execute("DELETE FROM book_tags WHERE book_id = ?", (book_id,))
        for tid in data["tagIds"]:
            db.execute("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)", (book_id, tid))

    if "isbn" in data:
        db.execute("DELETE FROM book_identifiers WHERE book_id = ? AND type = 'isbn'", (book_id,))
        if data["isbn"]:
            db.execute("INSERT INTO book_identifiers (book_id, type, value) VALUES (?, 'isbn', ?)",
                       (book_id, data["isbn"]))



def delete_book(book_id: int):
    db = get_db()
    db.execute("DELETE FROM books WHERE id = ?", (book_id,))


def search_books(query: str, limit=50):
    db = get_db()
    escaped = query.lower().replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    p = {"pattern": pattern, "limit": limit}

    books = dicts_from_rows(db.execute("""
        SELECT DISTINCT b.id, b.title, b.cover_path,
            GROUP_CONCAT(DISTINCT a.name) as authors, s.name as series_name
        FROM books b
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        LEFT JOIN series s ON b.series_id = s.id
        WHERE lower_utf8(b.title) LIKE :pattern ESCAPE '\\' OR lower_utf8(a.name) LIKE :pattern ESCAPE '\\'
            OR lower_utf8(s.name) LIKE :pattern ESCAPE '\\'
        GROUP BY b.id LIMIT :limit
    """, p).fetchall())

    authors = dicts_from_rows(db.execute("""
        SELECT a.id, a.name, COUNT(ba.book_id) as book_count
        FROM authors a JOIN book_authors ba ON a.id = ba.author_id
        WHERE lower_utf8(a.name) LIKE :pattern ESCAPE '\\'
        GROUP BY a.id ORDER BY book_count DESC LIMIT 10
    """, p).fetchall())

    series = dicts_from_rows(db.execute("""
        SELECT s.id, s.name, COUNT(b.id) as book_count, GROUP_CONCAT(DISTINCT a.name) as authors
        FROM series s JOIN books b ON b.series_id = s.id
        LEFT JOIN book_authors ba ON b.id = ba.book_id LEFT JOIN authors a ON ba.author_id = a.id
        WHERE lower_utf8(s.name) LIKE :pattern ESCAPE '\\'
        GROUP BY s.id ORDER BY book_count DESC LIMIT 10
    """, p).fetchall())

    return {"books": books, "authors": authors, "series": series}
