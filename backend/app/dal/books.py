import re
import sqlite3
from pathlib import Path

import aiosql
from rapidfuzz import process

from ..database import dicts_from_rows, dict_from_row
from ..dtos.books import (
    BookCreateData,
    BookFileLookup,
    BookFileRow,
    BookIdentifierRow,
    BookListPage,
    BookListRow,
    BookUpdateData,
    DuplicateHit,
)
from ..dtos.catalog import CatalogFilters
from ..dtos.search import SearchResults
from ..search import (
    AUTHORS_SERIES_LIMIT,
    SEARCH_SCORE_CUTOFF,
    search_preprocess,
    token_min_ratio,
)
from .filters import build_book_where
from .sort import resolve_order_clause

queries = aiosql.from_path(Path(__file__).parent / "queries" / "books", "sqlite3")


def get_books(db: sqlite3.Connection, filters: CatalogFilters, sort: str = "added_desc", cursor=0, page_size=50) -> BookListPage:
    if sort in ("rating_desc", "rating_asc") and not filters.get("userId"):
        raise ValueError(f"{sort} requires userId in filters")

    where, params = build_book_where(filters)
    uid = filters.get("userId")
    # uid всегда в params: None валиден для JOIN через NULL-three-valued logic.
    params.update(lim=page_size + 1, off=cursor, uid=uid)

    # SQL-safe: {where_clause} and {order_clause} from whitelist-sources.
    order_clause = resolve_order_clause(sort)
    final_sql = (
        queries.get_books.sql
        .replace("{where_clause}", where)
        .replace("{order_clause}", order_clause)
    )
    rows = db.execute(final_sql, params).fetchall()

    books = dicts_from_rows(rows)
    has_more = len(books) > page_size
    if has_more:
        books = books[:page_size]

    return {"books": books, "hasMore": has_more}


def get_book_by_id(db: sqlite3.Connection, book_id: int, user_id: int | None = None) -> BookListRow | None:
    # uid всегда передаётся — None валиден через NULL-three-valued logic в JOIN.
    row = queries.get_book_by_id(db, id=book_id, uid=user_id)
    return dict_from_row(row)


def get_book_files(db: sqlite3.Connection, book_id: int) -> list[BookFileRow]:
    return dicts_from_rows(queries.get_book_files(db, book_id=book_id))


def get_book_identifiers(db: sqlite3.Connection, book_id: int) -> list[BookIdentifierRow]:
    return dicts_from_rows(queries.get_book_identifiers(db, book_id=book_id))


def get_all_publishers(db: sqlite3.Connection) -> list[str]:
    """Publisher directory: sorted alphabetically."""
    return [r["publisher"] for r in queries.get_all_publishers(db)]


def _sort_title(title: str) -> str:
    return re.sub(r"^(The|A|An)\s+", "", title, flags=re.IGNORECASE)


def create_book(db: sqlite3.Connection, data: BookCreateData) -> int:
    book_id = queries.insert_book(
        db,
        title=data["title"],
        sort_title=data.get("sort_title") or _sort_title(data["title"]),
        description=data.get("description"),
        language=data.get("language"),
        publisher=data.get("publisher"),
        pub_date=data.get("pub_date"),
        series_id=data.get("series_id"),
        series_number=data.get("series_number"),
        cover_path=data.get("cover_path"),
    )
    for aid in data.get("author_ids", []):
        queries.insert_book_author(db, book_id=book_id, author_id=aid)
    for tid in data.get("tag_ids", []):
        queries.insert_book_tag(db, book_id=book_id, tag_id=tid)
    return book_id


def update_book(db: sqlite3.Connection, book_id: int, data: BookUpdateData) -> None:
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
        queries.delete_book_authors(db, book_id=book_id)
        for aid in data["authorIds"]:
            queries.insert_book_author(db, book_id=book_id, author_id=aid)

    if "tagIds" in data:
        queries.delete_book_tags(db, book_id=book_id)
        for tid in data["tagIds"]:
            queries.insert_book_tag(db, book_id=book_id, tag_id=tid)

    if "isbn" in data:
        queries.delete_book_identifier_isbn(db, book_id=book_id)
        if data["isbn"]:
            queries.insert_book_identifier(db, book_id=book_id, type="isbn", value=data["isbn"])


def delete_book(db: sqlite3.Connection, book_id: int) -> None:
    queries.delete_book(db, id=book_id)


def search_books(db: sqlite3.Connection, query: str, limit=50) -> SearchResults:
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
    are deliberately out of scope — они используют простой LIKE-match,
    fuzzy-migration планируется отдельно.
    """
    q = (query or "").strip()
    if not q:
        return {"books": [], "authors": [], "series": []}

    extract_kwargs = {
        "scorer": token_min_ratio,
        "processor": search_preprocess,
        "score_cutoff": SEARCH_SCORE_CUTOFF,
    }

    # Books: full outer fetch, fuzzy-rank against title + authors + series_name.
    # GROUP_CONCAT uses SQLite's default comma separator. That's fine
    # here because search_preprocess turns the comma into a space
    # before scoring. If search_preprocess ever stops normalising
    # punctuation, this concat will silently break — see also the
    # series query below, same caveat.
    book_rows = dicts_from_rows(queries.search_books_books(db))
    book_choices = {
        r["id"]: f"{r['title'] or ''} {r['authors'] or ''} {r['series_name'] or ''}"
        for r in book_rows
    }
    book_matches = process.extract(q, book_choices, limit=limit, **extract_kwargs)
    book_by_id = {r["id"]: r for r in book_rows}
    books = [book_by_id[bid] for _, _, bid in book_matches]

    # Authors: fuzzy-rank against name only.
    author_rows = dicts_from_rows(queries.search_books_authors(db))
    author_choices = {r["id"]: r["name"] or "" for r in author_rows}
    author_matches = process.extract(
        q, author_choices, limit=AUTHORS_SERIES_LIMIT, **extract_kwargs
    )
    author_by_id = {r["id"]: r for r in author_rows}
    authors = [author_by_id[aid] for _, _, aid in author_matches]

    # Series: fuzzy-rank against name + concatenated authors.
    series_rows = dicts_from_rows(queries.search_books_series(db))
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
    return queries.book_exists(db, id=book_id) is not None


def book_file_exists(db: sqlite3.Connection, book_id: int, fmt: str) -> bool:
    return queries.book_file_exists(db, book_id=book_id, format=fmt) is not None


def add_book_file(db: sqlite3.Connection, book_id: int, fmt: str, file_path: str, file_size: int) -> None:
    queries.add_book_file(db, book_id=book_id, format=fmt, file_path=file_path, file_size=file_size)


def get_book_file(db: sqlite3.Connection, book_id: int, fmt: str) -> BookFileLookup | None:
    row = queries.get_book_file(db, book_id=book_id, format=fmt)
    return dict_from_row(row)


def delete_book_file(db: sqlite3.Connection, file_id: int) -> None:
    queries.delete_book_file(db, id=file_id)


def update_cover_path(db: sqlite3.Connection, book_id: int, cover_path: str) -> None:
    queries.update_cover_path(db, id=book_id, cover_path=cover_path)


def add_book_identifier(db: sqlite3.Connection, book_id: int, id_type: str, value: str) -> None:
    queries.insert_book_identifier(db, book_id=book_id, type=id_type, value=value)


def find_duplicates_by_title(db: sqlite3.Connection, title: str) -> list[DuplicateHit]:
    # Still on LIKE intentionally — upload dedup lives with provider
    # matching (Google Books / Литрес author & series reconciliation),
    # миграция на rapidfuzz со стриктным score_cutoff (~85) и reuse
    # search_preprocess из app.search запланирована отдельно.
    escaped = title.lower().replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    return dicts_from_rows(queries.find_duplicates_by_title(db, pattern=pattern))
