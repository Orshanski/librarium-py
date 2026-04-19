import sqlite3

from ..database import dicts_from_rows, dict_from_row
from ..dtos.catalog import CatalogFilters
from .book_list_query import BOOK_LIST_JOINS, BOOK_LIST_AGGREGATE_COLUMNS
from .filters import build_book_where


def get_tag_cloud(db: sqlite3.Connection, top: int | None = None):
    """Tag cloud: name + book_count, sorted by count DESC."""
    limit = "LIMIT :top" if top else ""
    params = {"top": top} if top else {}
    return dicts_from_rows(db.execute(f"""
        SELECT t.id, t.name, COUNT(bt.book_id) as book_count
        FROM tags t JOIN book_tags bt ON t.id = bt.tag_id
        GROUP BY t.id ORDER BY book_count DESC {limit}
    """, params).fetchall())



def list_tag_options(db: sqlite3.Connection, filters: CatalogFilters) -> list[dict]:
    """Tag options for filter bar, scoped by other filters."""
    where, params = build_book_where(filters, exclude="tagIds")
    return dicts_from_rows(db.execute(f"""
        SELECT DISTINCT t.id, t.name FROM tags t
        JOIN book_tags bt ON t.id = bt.tag_id
        JOIN books b ON bt.book_id = b.id
        {where} ORDER BY t.name COLLATE NOCASE
    """, params).fetchall())


def get_tag_by_id(db: sqlite3.Connection, tag_id: int, author_ids=None, series_ids=None, language=None):
    tag = dict_from_row(db.execute("SELECT * FROM tags WHERE id = :id", {"id": tag_id}).fetchone())
    if not tag:
        return None

    # filters stays untyped pending `librarium-py-t3ze`: detail pages
    # (author/series/tag) do not propagate user_id -> hidden-books filter
    # is not applied. Once that bug is fixed, `user_id` will flow in and
    # this local becomes `CatalogFilters` automatically (same as
    # get_authors / get_series after hl8.3.1 follow-up).
    filters: dict = {}
    if author_ids:
        filters["authorIds"] = author_ids
    if series_ids:
        filters["seriesIds"] = series_ids
    if language:
        filters["language"] = language

    where_sql, params = build_book_where(filters)
    params["id"] = tag_id

    books = dicts_from_rows(db.execute(f"""
        SELECT {BOOK_LIST_AGGREGATE_COLUMNS}
        FROM books b
        JOIN book_tags bt_scope ON b.id = bt_scope.book_id AND bt_scope.tag_id = :id
        {BOOK_LIST_JOINS}
        {where_sql}
        GROUP BY b.id ORDER BY b.added_at DESC
    """, params).fetchall())

    return {"tag": tag, "books": books}


def resolve_raw_tag(db: sqlite3.Connection, raw_tag: str) -> int:
    """Resolve raw genre code to tag_id via tag_mappings.
    If unknown -- create tag + mapping."""
    row = db.execute(
        "SELECT tag_id FROM tag_mappings WHERE raw_tag = :raw COLLATE NOCASE",
        {"raw": raw_tag},
    ).fetchone()
    if row:
        return row["tag_id"]
    tag_id = get_or_create_tag(db, raw_tag)
    db.execute(
        "INSERT OR IGNORE INTO tag_mappings (raw_tag, tag_id) VALUES (:raw, :tid)",
        {"raw": raw_tag, "tid": tag_id},
    )
    return tag_id


def _capitalize_tag(name: str) -> str:
    """Capitalize first letter, leave the rest untouched.

    Special case: if the string is ALL-CAPS and longer than 4 chars, lowercase
    everything after the first letter (SCIENCE FICTION -> Science fiction).
    Acronyms up to 4 chars (AI, SQL, HTTP, REST) are preserved.
    """
    s = name.strip()
    if not s:
        return s
    if len(s) > 4 and s == s.upper() and any(c.isalpha() for c in s):
        return s[0] + s[1:].lower()
    return s[0].upper() + s[1:]


def resolve_tag_names(db: sqlite3.Connection, raw_tags: list[str]) -> list[str]:
    """Resolve raw genre codes to human-readable tag names.
    Unknown tags pass through as-is (with first letter capitalized)."""
    if not raw_tags:
        return []
    seen: set[str] = set()
    result = []
    for raw in raw_tags:
        row = db.execute(
            "SELECT t.name FROM tag_mappings m JOIN tags t ON m.tag_id = t.id WHERE m.raw_tag = :raw COLLATE NOCASE",
            {"raw": raw},
        ).fetchone()
        name = row["name"] if row else _capitalize_tag(raw)
        if name not in seen:
            seen.add(name)
            result.append(name)
    return result


def map_tag(db: sqlite3.Connection, tag_id: int, target_name: str) -> dict:
    """Map tag to target (rename or merge).
    Returns {"renamed": bool, "target_id": int}."""
    target_name = target_name.strip()
    existing = db.execute(
        "SELECT id FROM tags WHERE name = :name AND id != :id",
        {"name": target_name, "id": tag_id},
    ).fetchone()

    if existing:
        target_id = existing["id"]
        # Remember source name for tag_mappings before deleting
        source_row = db.execute("SELECT name FROM tags WHERE id = :id", {"id": tag_id}).fetchone()
        source_name = source_row["name"] if source_row else None
        db.execute("""
            INSERT OR IGNORE INTO book_tags (book_id, tag_id)
            SELECT book_id, :target FROM book_tags WHERE tag_id = :source
        """, {"target": target_id, "source": tag_id})
        db.execute("DELETE FROM book_tags WHERE tag_id = :source", {"source": tag_id})
        db.execute("UPDATE tag_mappings SET tag_id = :target WHERE tag_id = :source",
                   {"target": target_id, "source": tag_id})
        # Add mapping from source name so future imports resolve correctly
        if source_name:
            db.execute("INSERT OR IGNORE INTO tag_mappings (raw_tag, tag_id) VALUES (:raw, :tid)",
                       {"raw": source_name, "tid": target_id})
        db.execute("DELETE FROM tags WHERE id = :source", {"source": tag_id})
        return {"renamed": False, "target_id": target_id}
    else:
        db.execute("UPDATE tags SET name = :name WHERE id = :id",
                   {"name": target_name, "id": tag_id})
        return {"renamed": True, "target_id": tag_id}


def get_or_create_tag(db: sqlite3.Connection, name: str) -> int:
    db.execute("INSERT OR IGNORE INTO tags (name) VALUES (:name)", {"name": name})
    row = db.execute("SELECT id FROM tags WHERE name = :name", {"name": name}).fetchone()
    return row["id"]


def tag_exists(db: sqlite3.Connection, tag_id: int) -> bool:
    return db.execute("SELECT id FROM tags WHERE id = :id", {"id": tag_id}).fetchone() is not None
