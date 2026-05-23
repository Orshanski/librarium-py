"""Shared WHERE clause builder and filter options for book queries."""
import sqlite3
from pathlib import Path
from typing import Any, NamedTuple, cast

import aiosql

from ..database import dicts_from_rows
from ..dtos.catalog import CatalogFilters, LanguageOptionRow

queries = aiosql.from_path(Path(__file__).parent / "queries" / "filters", "sqlite3")


class _ListDimension(NamedTuple):
    key: str
    sql_tpl: str
    prefix: str


_LIST_DIMENSIONS: tuple[_ListDimension, ...] = (
    _ListDimension("authorIds", "b.id IN (SELECT book_id FROM book_authors WHERE author_id IN ({ph}))", "a"),
    _ListDimension("tagIds", "b.id IN (SELECT book_id FROM book_tags WHERE tag_id IN ({ph}))", "t"),
    _ListDimension("seriesIds", "b.series_id IN ({ph})", "s"),
    _ListDimension("language", "b.language IN ({ph})", "l"),
)


def build_book_where(
    filters: CatalogFilters,
    *,
    user_id: int | None = None,
    exclude: str | None = None,
    extra_clauses: list[tuple[str, dict]] | None = None,
) -> tuple[str, dict]:
    """Build WHERE clause for queries filtering through the books table.

    Supported filter keys: authorIds, tagIds, seriesIds, language.
    user_id — scope context для hidden-books фильтра; передаётся отдельно от filters.

    Args:
        filters: `CatalogFilters` — dimension filters only (no user scope)
        user_id: scope context; when not None, hidden books for this user are excluded
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

    if user_id is not None:
        clauses.append("(b.id IS NULL OR b.id NOT IN (SELECT book_id FROM user_books WHERE user_id = :uid AND is_hidden = 1))")
        params["uid"] = user_id

    for dim in _LIST_DIMENSIONS:
        values = cast(list[Any] | None, effective.get(dim.key))
        if not values:
            continue
        ph = ",".join(f":{dim.prefix}{i}" for i in range(len(values)))
        clauses.append(dim.sql_tpl.replace("{ph}", ph))
        for i, v in enumerate(values):
            params[f"{dim.prefix}{i}"] = v

    if not clauses:
        return "", params
    return "WHERE " + " AND ".join(clauses), params


def list_language_options(db: sqlite3.Connection, *, user_id: int, filters: CatalogFilters) -> list[LanguageOptionRow]:
    """Language options for filter bar, scoped by other filters."""
    where, params = build_book_where(
        filters,
        user_id=user_id,
        exclude="language",
        extra_clauses=[("b.language IS NOT NULL", {})],
    )
    # SQL-safe: {where_clause} substituted from whitelist-source
    # (build_book_where output). Runtime data via bind params.
    final_sql = queries.list_language_options.sql.replace("{where_clause}", where)
    return cast(list[LanguageOptionRow], dicts_from_rows(db.execute(final_sql, params).fetchall()))
