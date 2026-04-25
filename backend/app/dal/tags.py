import sqlite3
from pathlib import Path
from typing import cast

import aiosql

from ..database import dicts_from_rows, dict_from_row
from ..dtos.catalog import CatalogFilters
from ..dtos.entities import (
    FilterOptionRow,
    TagCloudEntry,
    TagDetailBookRow,
    TagDetailRow,
    TagMapResult,
)
from ._parsers import parse_book_row_aggregates
from .filters import build_book_where
from .sort import resolve_order_clause

queries = aiosql.from_path(Path(__file__).parent / "queries" / "tags", "sqlite3")


def get_tag_cloud(db: sqlite3.Connection, top: int | None = None) -> list[TagCloudEntry]:
    """Tag cloud: name + book_count, sorted by count DESC."""
    limit_clause = "LIMIT :top" if top else ""
    params = {"top": top} if top else {}
    # SQL-safe: {limit_clause} from whitelist-source.
    final_sql = queries.get_tag_cloud.sql.replace("{limit_clause}", limit_clause)
    return dicts_from_rows(db.execute(final_sql, params).fetchall())


def list_tag_options(db: sqlite3.Connection, filters: CatalogFilters) -> list[FilterOptionRow]:
    """Tag options for filter bar, scoped by other filters."""
    where, params = build_book_where(filters, exclude="tagIds")
    # SQL-safe: {where_clause} from whitelist-source (build_book_where).
    final_sql = queries.list_tag_options.sql.replace("{where_clause}", where)
    return dicts_from_rows(db.execute(final_sql, params).fetchall())


def get_tag_by_id(
    db: sqlite3.Connection,
    tag_id: int,
    user_id: int,
    author_ids: list[int] | None = None,
    series_ids: list[int] | None = None,
    language: list[str] | None = None,
    sort: str = "addedDesc",
) -> TagDetailRow | None:
    tag = dict_from_row(queries.get_tag_header(db, id=tag_id))
    if not tag:
        return None

    filters: dict = {}
    if author_ids:
        filters["authorIds"] = author_ids
    if series_ids:
        filters["seriesIds"] = series_ids
    if language:
        filters["language"] = language

    where_sql, params = build_book_where(filters)
    params["id"] = tag_id
    params["uid"] = user_id
    order_clause = resolve_order_clause(sort)

    final_sql = (
        queries.get_tag_books.sql
        .replace("{where_clause}", where_sql)
        .replace("{order_clause}", order_clause)
    )
    books = dicts_from_rows(db.execute(final_sql, params).fetchall())
    for r in books:
        parse_book_row_aggregates(r)
    return cast(TagDetailRow, {"tag": tag, "books": cast(list[TagDetailBookRow], books)})


def resolve_raw_tag(db: sqlite3.Connection, raw_tag: str) -> int:
    """Resolve raw genre code to tag_id via tag_mappings.
    If unknown -- create tag + mapping."""
    row = queries.resolve_raw_tag(db, raw=raw_tag)
    if row:
        return row["tag_id"]
    tag_id = get_or_create_tag(db, raw_tag)
    queries.insert_tag_mapping(db, raw=raw_tag, tid=tag_id)
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
        row = queries.resolve_tag_name(db, raw=raw)
        name = row["name"] if row else _capitalize_tag(raw)
        if name not in seen:
            seen.add(name)
            result.append(name)
    return result


def map_tag(db: sqlite3.Connection, tag_id: int, target_name: str) -> TagMapResult:
    """Map tag to target (rename or merge).
    Returns {"renamed": bool, "target_id": int}."""
    target_name = target_name.strip()
    existing = queries.map_tag_check_existing(db, name=target_name, id=tag_id)

    if existing:
        target_id = existing["id"]
        # Remember source name for tag_mappings before deleting
        source_row = queries.get_tag_name_by_id(db, id=tag_id)
        source_name = source_row["name"] if source_row else None
        queries.insert_book_tags_from_source(db, target=target_id, source=tag_id)
        queries.delete_book_tags_by_source(db, source=tag_id)
        queries.update_tag_mappings_target(db, target=target_id, source=tag_id)
        # Add mapping from source name so future imports resolve correctly
        if source_name:
            queries.insert_tag_mapping(db, raw=source_name, tid=target_id)
        queries.delete_tag_by_id(db, source=tag_id)
        return {"renamed": False, "target_id": target_id}
    else:
        queries.update_tag_name(db, name=target_name, id=tag_id)
        return {"renamed": True, "target_id": tag_id}


def get_or_create_tag(db: sqlite3.Connection, name: str) -> int:
    queries.insert_or_ignore_tag(db, name=name)
    row = queries.get_tag_id_by_name(db, name=name)
    return row["id"]


def tag_exists(db: sqlite3.Connection, tag_id: int) -> bool:
    return queries.tag_exists(db, id=tag_id) is not None
