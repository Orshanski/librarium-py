"""Shared WHERE clause builder and filter options for book queries."""
import sqlite3
from pathlib import Path

import aiosql

from ..database import dicts_from_rows
from ..dtos.catalog import CatalogFilters, LanguageOptionRow

queries = aiosql.from_path(Path(__file__).parent / "queries" / "filters", "sqlite3")

# (filter_key, sql_template_with_{ph}_placeholder, param_prefix)
_LIST_DIMENSIONS: list[tuple[str, str, str]] = [
    ("authorIds", "b.id IN (SELECT book_id FROM book_authors WHERE author_id IN ({ph}))", "a"),
    ("tagIds",    "b.id IN (SELECT book_id FROM book_tags WHERE tag_id IN ({ph}))",      "t"),
    ("seriesIds", "b.series_id IN ({ph})", "s"),
    ("language",  "b.language IN ({ph})",  "l"),
]


def build_book_where(
    filters: CatalogFilters,
    *,
    exclude: str | None = None,
    extra_clauses: list[tuple[str, dict]] | None = None,
) -> tuple[str, dict]:
    """Build WHERE clause for queries filtering through the books table.

    Supported filter keys: userId, authorIds, tagIds, seriesIds, language.

    Args:
        filters: `CatalogFilters` — user scope plus optional dimension filters
        exclude: optional key to skip (for cross-dimension filter options)
        extra_clauses: additional (sql_fragment, params_dict) tuples.
            Param names must not collide with built-in: uid, a0..aN, t0..tN, s0..sN, l0..lN.

    Returns:
        (where_sql, params) -- where_sql includes "WHERE " prefix or is empty string
    """
    effective = {k: v for k, v in filters.items() if k != exclude} if exclude else filters
    clauses: list[str] = []
    params: dict = {}

    if extra_clauses:
        for sql, p in extra_clauses:
            clauses.append(sql)
            params.update(p)

    if uid := effective.get("userId"):
        clauses.append("b.id NOT IN (SELECT book_id FROM user_books WHERE user_id = :uid AND is_hidden = 1)")
        params["uid"] = uid

    for key, sql_tpl, prefix in _LIST_DIMENSIONS:
        values = effective.get(key)
        if not values:
            continue
        ph = ",".join(f":{prefix}{i}" for i in range(len(values)))
        clauses.append(sql_tpl.format(ph=ph))
        for i, v in enumerate(values):
            params[f"{prefix}{i}"] = v

    if not clauses:
        return "", params
    return "WHERE " + " AND ".join(clauses), params


def list_language_options(db: sqlite3.Connection, filters: CatalogFilters) -> list[LanguageOptionRow]:
    """Language options for filter bar, scoped by other filters."""
    where, params = build_book_where(
        filters,
        exclude="language",
        extra_clauses=[("b.language IS NOT NULL", {})],
    )
    # SQL-safe: {where_clause} substituted from whitelist-source
    # (build_book_where output). Runtime data via bind params.
    final_sql = queries.list_language_options.sql.replace("{where_clause}", where)
    return dicts_from_rows(db.execute(final_sql, params).fetchall())
