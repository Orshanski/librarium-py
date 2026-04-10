import re
import sqlite3

from ..database import dicts_from_rows, dict_from_row
from .filters import build_book_where


_BOOK_SELECT = """
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
    LEFT JOIN user_books ub ON b.id = ub.book_id
"""

ORDER = {
    "title_asc": "ORDER BY COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC, b.id",
    "title_desc": "ORDER BY COALESCE(b.sort_title, b.title) COLLATE NOCASE DESC, b.id",
    "author_asc": "ORDER BY (SELECT a.sort_name FROM authors a JOIN book_authors ba ON a.id = ba.author_id WHERE ba.book_id = b.id LIMIT 1) COLLATE NOCASE ASC, b.id",
    "rating_desc": "ORDER BY (SELECT rating FROM user_books WHERE user_id = :uid AND book_id = b.id) DESC NULLS LAST, b.id",
    "added_desc": "ORDER BY b.added_at DESC, b.id",
}


def get_books(db: sqlite3.Connection, filters: dict, sort="added_desc", cursor=0, page_size=50):
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
        {_BOOK_SELECT} {ub_join}
        {where} GROUP BY b.id {order} LIMIT :lim OFFSET :off
    """, params).fetchall()

    books = dicts_from_rows(rows)
    has_more = len(books) > page_size
    if has_more:
        books = books[:page_size]

    return {"books": books, "hasMore": has_more}


def get_book_by_id(db: sqlite3.Connection, book_id: int, user_id: int | None = None):
    ub_join = "AND ub.user_id = :uid" if user_id else "AND 0"
    row = db.execute(f"""
        {_BOOK_SELECT} {ub_join}
        WHERE b.id = :id GROUP BY b.id
    """, {"id": book_id, "uid": user_id or 0}).fetchone()
    return dict_from_row(row)


def get_book_files(db: sqlite3.Connection, book_id: int):
    return dicts_from_rows(db.execute(
        "SELECT id, format, file_path, file_size FROM book_files WHERE book_id = :id", {"id": book_id}
    ).fetchall())


def get_book_identifiers(db: sqlite3.Connection, book_id: int):
    return dicts_from_rows(db.execute(
        "SELECT type, value FROM book_identifiers WHERE book_id = :id", {"id": book_id}
    ).fetchall())


def get_all_publishers(db: sqlite3.Connection):
    """Publisher directory: sorted alphabetically."""
    return [r["publisher"] for r in db.execute(
        "SELECT DISTINCT publisher FROM books WHERE publisher IS NOT NULL AND publisher != '' ORDER BY publisher COLLATE NOCASE"
    ).fetchall()]


def _sort_title(title: str) -> str:
    return re.sub(r"^(The|A|An)\s+", "", title, flags=re.IGNORECASE)


def create_book(db: sqlite3.Connection, data: dict) -> int:
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


def update_book(db: sqlite3.Connection, book_id: int, data: dict):
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



def delete_book(db: sqlite3.Connection, book_id: int):
    db.execute("DELETE FROM books WHERE id = ?", (book_id,))


def search_books(db: sqlite3.Connection, query: str, limit=50):
    """Fuzzy UI search across books, authors, and series.

    Uses a custom rapidfuzz-compatible scorer (`token_min_ratio` in
    `app.search`) that tolerates punctuation, word order, missing
    connectives, typos, and ё/е variations while staying tight on
    short-query noise. Scores each field separately (title, authors,
    series) to avoid score dilution from long concatenated haystacks.

    Loads the whole table per slice; that's fine at the current scale
    (personal family library, pair-of-thousands of books). Revisit
    performance if search starts feeling slow in real use — see the
    separate perf follow-up bead for tightening options (pre-tokenise
    choices, early-exit in the scorer, etc).

    Contract: `limit` applies to `books` only. `authors` and `series`
    use a hardcoded cap (AUTHORS_SERIES_LIMIT) to keep the wire
    response tight, matching the pre-fuzzy behaviour.

    `find_duplicates_by_title` (upload dedup) and provider matching
    are deliberately out of scope — see bead librarium-py-7o2.
    """
    from rapidfuzz import process

    from ..search import (
        AUTHORS_SERIES_LIMIT,
        SEARCH_SCORE_CUTOFF,
        search_preprocess,
        token_min_ratio,
    )

    q = (query or "").strip()
    if not q:
        return {"books": [], "authors": [], "series": []}

    extract_kwargs = {
        "scorer": token_min_ratio,
        "processor": search_preprocess,
        "score_cutoff": SEARCH_SCORE_CUTOFF,
    }

    # Books: full outer fetch, fuzzy-rank against title + authors + series_name.
    book_rows = dicts_from_rows(db.execute("""
        SELECT b.id, b.title, b.cover_path,
            GROUP_CONCAT(DISTINCT a.name) as authors, s.name as series_name
        FROM books b
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        LEFT JOIN series s ON b.series_id = s.id
        GROUP BY b.id
    """).fetchall())
    book_choices = {
        r["id"]: f"{r['title'] or ''} {r['authors'] or ''} {r['series_name'] or ''}"
        for r in book_rows
    }
    book_matches = process.extract(q, book_choices, limit=limit, **extract_kwargs)
    book_by_id = {r["id"]: r for r in book_rows}
    books = [book_by_id[bid] for _, _, bid in book_matches]

    # Authors: fuzzy-rank against name only.
    author_rows = dicts_from_rows(db.execute("""
        SELECT a.id, a.name, COUNT(ba.book_id) as book_count
        FROM authors a JOIN book_authors ba ON a.id = ba.author_id
        GROUP BY a.id
    """).fetchall())
    author_choices = {r["id"]: r["name"] or "" for r in author_rows}
    author_matches = process.extract(
        q, author_choices, limit=AUTHORS_SERIES_LIMIT, **extract_kwargs
    )
    author_by_id = {r["id"]: r for r in author_rows}
    authors = [author_by_id[aid] for _, _, aid in author_matches]

    # Series: fuzzy-rank against name + concatenated authors.
    series_rows = dicts_from_rows(db.execute("""
        SELECT s.id, s.name, COUNT(b.id) as book_count,
               GROUP_CONCAT(DISTINCT a.name) as authors
        FROM series s JOIN books b ON b.series_id = s.id
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        GROUP BY s.id
    """).fetchall())
    series_choices = {
        r["id"]: f"{r['name'] or ''} {r['authors'] or ''}" for r in series_rows
    }
    series_matches = process.extract(
        q, series_choices, limit=AUTHORS_SERIES_LIMIT, **extract_kwargs
    )
    series_by_id = {r["id"]: r for r in series_rows}
    series = [series_by_id[sid] for _, _, sid in series_matches]

    return {"books": books, "authors": authors, "series": series}


def book_exists(db: sqlite3.Connection, book_id: int) -> bool:
    return db.execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone() is not None


def book_file_exists(db: sqlite3.Connection, book_id: int, fmt: str) -> bool:
    return db.execute("SELECT id FROM book_files WHERE book_id = ? AND format = ?", (book_id, fmt)).fetchone() is not None


def add_book_file(db: sqlite3.Connection, book_id: int, fmt: str, file_path: str, file_size: int):
    db.execute(
        "INSERT OR IGNORE INTO book_files (book_id, format, file_path, file_size) VALUES (?, ?, ?, ?)",
        (book_id, fmt, file_path, file_size),
    )


def get_book_file(db: sqlite3.Connection, book_id: int, fmt: str):
    return dict_from_row(db.execute(
        "SELECT id, file_path FROM book_files WHERE book_id = ? AND format = ?",
        (book_id, fmt),
    ).fetchone())


def delete_book_file(db: sqlite3.Connection, file_id: int):
    db.execute("DELETE FROM book_files WHERE id = ?", (file_id,))


def update_cover_path(db: sqlite3.Connection, book_id: int, cover_path: str):
    db.execute("UPDATE books SET cover_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
               (cover_path, book_id))


def add_book_identifier(db: sqlite3.Connection, book_id: int, id_type: str, value: str):
    db.execute("INSERT INTO book_identifiers (book_id, type, value) VALUES (?, ?, ?)",
               (book_id, id_type, value))


def find_duplicates_by_title(db: sqlite3.Connection, title: str) -> list[dict]:
    # Still on LIKE intentionally — upload dedup lives with provider
    # matching (Google Books / Литрес author & series reconciliation),
    # tracked separately as librarium-py-7o2. When that ships, this
    # function migrates to rapidfuzz with a stricter score_cutoff
    # (~85) and reuses search_preprocess from app.search.
    escaped = title.lower().replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    rows = db.execute("""
        SELECT b.id, b.title, GROUP_CONCAT(DISTINCT a.name) as authors
        FROM books b
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        WHERE lower_utf8(b.title) LIKE ? ESCAPE '\\'
        GROUP BY b.id LIMIT 5
    """, (pattern,)).fetchall()
    return dicts_from_rows(rows)
