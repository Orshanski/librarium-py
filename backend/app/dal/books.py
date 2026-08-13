import re
import sqlite3
from pathlib import Path
from typing import Any, cast

import aiosql
from rapidfuzz import process

from ..database import dicts_from_rows, dict_from_row
from ..dtos.books import (
    BookCreateData,
    BookFileLookup,
    BookFileRow,
    BookIdentifierRow,
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
from ._parsers import parse_book_row_aggregates
from .filters import build_book_where
from .sort import resolve_order_clause

queries = aiosql.from_path(Path(__file__).parent / "queries" / "books", "sqlite3")


def get_books(
    db: sqlite3.Connection,
    user_id: int | None = None,
    sort: str = "addedDesc",
    cursor: int = 0,
    page_size: int = 50,
    filters: CatalogFilters | None = None,
) -> list[BookListRow]:
    if sort in ("ratingDesc", "ratingAsc") and user_id is None:
        raise ValueError(f"{sort} requires userId")

    where, params = build_book_where(filters or {}, user_id=user_id)
    # uid always in params: None is valid for the LEFT JOIN via three-valued logic.
    params.update(lim=page_size, off=cursor)
    params["uid"] = user_id

    # SQL-safe: {where_clause} and {order_clause} from whitelist-sources only.
    order_clause = resolve_order_clause(sort)
    final_sql = (
        queries.get_books.sql
        .replace("{where_clause}", where)
        .replace("{order_clause}", order_clause)
    )
    raw_rows = db.execute(final_sql, params).fetchall()

    rows = [dict(r) for r in raw_rows]
    for row in rows:
        parse_book_row_aggregates(row)
    return cast(list[BookListRow], rows)


def get_book_by_id(db: sqlite3.Connection, book_id: int, user_id: int | None = None) -> BookListRow | None:
    # uid always passed — None is valid via three-valued logic in LEFT JOIN.
    row = queries.get_book_by_id(db, id=book_id, uid=user_id)
    if row is None:
        return None
    result = dict(row)
    parse_book_row_aggregates(result)
    return cast(BookListRow, result)


def get_book_files(db: sqlite3.Connection, book_id: int) -> list[BookFileRow]:
    return cast(list[BookFileRow], dicts_from_rows(queries.get_book_files(db, book_id=book_id)))


def get_book_identifiers(db: sqlite3.Connection, book_id: int) -> list[BookIdentifierRow]:
    return cast(
        list[BookIdentifierRow],
        dicts_from_rows(queries.get_book_identifiers(db, book_id=book_id)),
    )


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


SCALAR_UPDATE_FIELDS = (
    "title", "description", "language",
    "publisher", "pub_date", "series_id",
    "series_number", "cover_path",
)
"""Скалярные поля books, обновляемые через update_book.
Порядок не важен — каждое поле включается только если присутствует в data."""


def update_book(db: sqlite3.Connection, book_id: int, data: BookUpdateData) -> None:
    sets = ["updated_at = CURRENT_TIMESTAMP"]
    params: dict[str, Any] = {"id": book_id}

    for key in SCALAR_UPDATE_FIELDS:
        if key in data:
            sets.append(f"{key} = :{key}")
            params[key] = data[key]  # pyright: ignore[reportTypedDictNotRequiredAccess]

    if "title" in data:
        title = cast(str, data["title"])
        sets.append("sort_title = :sort_title")
        params["sort_title"] = data.get("sort_title") or _sort_title(title)

    db.execute(f"UPDATE books SET {', '.join(sets)} WHERE id = :id", params)

    if "author_ids" in data:
        queries.delete_book_authors(db, book_id=book_id)
        for aid in data["author_ids"]:
            queries.insert_book_author(db, book_id=book_id, author_id=aid)

    if "tag_ids" in data:
        queries.delete_book_tags(db, book_id=book_id)
        for tid in data["tag_ids"]:
            queries.insert_book_tag(db, book_id=book_id, tag_id=tid)

    if "isbn" in data:
        queries.delete_book_identifier_isbn(db, book_id=book_id)
        if data["isbn"]:
            queries.insert_book_identifier(db, book_id=book_id, type="isbn", value=data["isbn"])


def delete_book(db: sqlite3.Connection, book_id: int) -> None:
    queries.delete_book(db, id=book_id)


def search_books(db: sqlite3.Connection, query: str, limit: int = 50, *, user_id: int) -> SearchResults:
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

    # Books: full outer fetch, fuzzy-rank against title + authors + series.
    book_rows = dicts_from_rows(queries.search_books_books(db, user_id=user_id))
    for r in book_rows:
        parse_book_row_aggregates(r)
    book_choices = {
        r["id"]: (
            f"{r['title'] or ''}"
            f" {' '.join(a.name for a in r['authors'])}"
            f" {r['series'].name if r['series'] else ''}"
        )
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

    # Series: fuzzy-rank against name + authors.
    series_rows = dicts_from_rows(queries.search_books_series(db))
    for r in series_rows:
        parse_book_row_aggregates(r)
    series_choices = {
        r["id"]: f"{r['name'] or ''} {' '.join(a.name for a in r['authors'])}"
        for r in series_rows
    }
    series_matches = process.extract(
        q, series_choices, limit=AUTHORS_SERIES_LIMIT, **extract_kwargs
    )
    series_by_id = {r["id"]: r for r in series_rows}
    series = [series_by_id[sid] for _, _, sid in series_matches]

    return cast(SearchResults, {"books": books, "authors": authors, "series": series})


def book_exists(db: sqlite3.Connection, book_id: int) -> bool:
    return queries.book_exists(db, id=book_id) is not None


def touch_book(db: sqlite3.Connection, book_id: int) -> None:
    queries.touch_book(db, id=book_id)


def book_file_exists(db: sqlite3.Connection, book_id: int, fmt: str) -> bool:
    return queries.book_file_exists(db, book_id=book_id, format=fmt) is not None


def add_book_file(db: sqlite3.Connection, book_id: int, fmt: str, file_path: str, file_size: int) -> None:
    queries.add_book_file(db, book_id=book_id, format=fmt, file_path=file_path, file_size=file_size)


def get_book_file(db: sqlite3.Connection, book_id: int, fmt: str) -> BookFileLookup | None:
    row = queries.get_book_file(db, book_id=book_id, format=fmt)
    return cast(BookFileLookup | None, dict_from_row(row))


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
    rows = dicts_from_rows(queries.find_duplicates_by_title(db, pattern=pattern))
    for r in rows:
        parse_book_row_aggregates(r)
    return cast(list[DuplicateHit], rows)
