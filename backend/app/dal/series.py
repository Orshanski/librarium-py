import sqlite3
from pathlib import Path
from typing import cast

import aiosql

from ..database import dicts_from_rows, dict_from_row
from ..dtos.catalog import CatalogFilters
from ..dtos.entities import EntityBookRow, FilterOptionRow, SeriesDetailRow, SeriesList, SeriesRow
from ..exceptions import BadInputError, NotFoundError
from .filters import build_book_where
from ._parsers import parse_book_row_aggregates

queries = aiosql.from_path(Path(__file__).parent / "queries" / "series", "sqlite3")


def list_series_options(db: sqlite3.Connection, *, user_id: int, filters: CatalogFilters) -> list[FilterOptionRow]:
    """Series options for filter bar, scoped by other filters."""
    where, params = build_book_where(filters, user_id=user_id, exclude="seriesIds")
    # SQL-safe: {where_clause} from whitelist-source (build_book_where).
    final_sql = queries.list_series_options.sql.replace("{where_clause}", where)
    return cast(list[FilterOptionRow], dicts_from_rows(db.execute(final_sql, params).fetchall()))


def get_series(db: sqlite3.Connection, *, user_id: int, author_ids: list[int] | None = None, tag_ids: list[int] | None = None, language: list[str] | None = None) -> SeriesList:
    filters: CatalogFilters = {}
    if author_ids:
        filters["authorIds"] = author_ids
    if tag_ids:
        filters["tagIds"] = tag_ids
    if language:
        filters["language"] = language

    where, params = build_book_where(filters, user_id=user_id)
    # SQL-safe: {where_clause} from whitelist-source (build_book_where).
    final_sql = queries.get_series.sql.replace("{where_clause}", where)
    rows = dicts_from_rows(db.execute(final_sql, params).fetchall())
    for r in rows:
        parse_book_row_aggregates(r)

    return {"series": cast(list[SeriesRow], rows)}


def get_series_by_id(db: sqlite3.Connection, series_id: int, user_id: int) -> SeriesDetailRow | None:
    s = dict_from_row(queries.get_series_by_id(db, id=series_id))
    if not s:
        return None

    rows = dicts_from_rows(queries.get_series_books(db, id=series_id, user_id=user_id))
    for r in rows:
        parse_book_row_aggregates(r)

    return cast(SeriesDetailRow, {"series": s, "books": cast(list[EntityBookRow], rows)})


def get_or_create_series(db: sqlite3.Connection, name: str) -> int:
    queries.insert_series(db, name=name, sort=name)
    row = queries.get_series_id_by_name(db, name=name)
    return row["id"]


def rename_series(db: sqlite3.Connection, series_id: int, name: str) -> None:
    queries.rename_series(db, name=name, id=series_id)


def merge_series(db: sqlite3.Connection, target_id: int, source_id: int) -> None:
    """Переносит книги source -> target, удаляет source."""
    queries.merge_series_books(db, target=target_id, source=source_id)
    queries.delete_series_by_source(db, source=source_id)


def delete_series(db: sqlite3.Connection, series_id: int) -> None:
    """Удаляет серию.

    Raises:
        NotFoundError: если серия не существует.
        BadInputError: если у серии есть книги (каскадное удаление запрещено).
    """
    exists = queries.series_exists(db, id=series_id)
    if not exists:
        raise NotFoundError("Серия не найдена")
    count = queries.count_series_books(db, id=series_id)["c"]
    if count > 0:
        raise BadInputError("Нельзя удалить серию с книгами")
    queries.delete_series(db, id=series_id)
