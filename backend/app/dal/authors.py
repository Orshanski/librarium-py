import sqlite3
from pathlib import Path
from typing import cast

import aiosql

from ..database import dicts_from_rows, dict_from_row
from ..dtos.catalog import CatalogFilters
from ..dtos.entities import AuthorDetailRow, AuthorRow, AuthorsList, EntityBookRow, FilterOptionRow
from ..exceptions import BadInputError, NotFoundError
from .filters import build_book_where
from ._parsers import parse_book_row_aggregates

queries = aiosql.from_path(Path(__file__).parent / "queries" / "authors", "sqlite3")


def get_authors(db: sqlite3.Connection, *, user_id: int, tag_ids: list[int] | None = None, language: list[str] | None = None) -> AuthorsList:
    filters: CatalogFilters = {}
    if tag_ids:
        filters["tagIds"] = tag_ids
    if language:
        filters["language"] = language

    where, params = build_book_where(filters, user_id=user_id)
    # SQL-safe: {where_clause} from whitelist-source (build_book_where).
    final_sql = queries.get_authors.sql.replace("{where_clause}", where)
    rows = dicts_from_rows(db.execute(final_sql, params).fetchall())
    for r in rows:
        parse_book_row_aggregates(r)

    return {"authors": cast(list[AuthorRow], rows)}


def list_author_options(db: sqlite3.Connection, *, user_id: int, filters: CatalogFilters) -> list[FilterOptionRow]:
    """Author options for filter bar, scoped by other filters."""
    where, params = build_book_where(filters, user_id=user_id, exclude="authorIds")
    # SQL-safe: {where_clause} from whitelist-source (build_book_where).
    final_sql = queries.list_author_options.sql.replace("{where_clause}", where)
    return cast(list[FilterOptionRow], dicts_from_rows(db.execute(final_sql, params).fetchall()))


def get_author_by_id(db: sqlite3.Connection, author_id: int, user_id: int) -> AuthorDetailRow | None:
    author = dict_from_row(queries.get_author_by_id(db, id=author_id))
    if not author:
        return None
    parse_book_row_aggregates(author)

    rows = dicts_from_rows(queries.get_author_books(db, id=author_id, user_id=user_id))
    for r in rows:
        parse_book_row_aggregates(r)

    return cast(AuthorDetailRow, {"author": author, "books": cast(list[EntityBookRow], rows)})


def _generate_sort_name(name: str) -> str:
    """Generate sort name by inverting 'First Last' -> 'Last, First'."""
    parts = name.strip().split()
    if len(parts) <= 1:
        return name.strip()
    return f"{parts[-1]}, {' '.join(parts[:-1])}"


def get_or_create_author(db: sqlite3.Connection, name: str) -> int:
    sort_name = _generate_sort_name(name)
    queries.insert_author(db, name=name, sort=sort_name)
    row = queries.get_author_id_by_name(db, name=name)
    return row["id"]


def rename_author(db: sqlite3.Connection, author_id: int, name: str) -> None:
    sort_name = _generate_sort_name(name)
    queries.rename_author(db, name=name, sort=sort_name, id=author_id)


def merge_authors(db: sqlite3.Connection, target_id: int, source_id: int) -> None:
    """Переносит книги source -> target, удаляет source."""
    queries.merge_authors_books(db, target=target_id, source=source_id)
    queries.delete_author_books(db, source=source_id)
    queries.delete_author_by_source(db, source=source_id)


def delete_author(db: sqlite3.Connection, author_id: int) -> None:
    """Удаляет автора.

    Raises:
        NotFoundError: если автор не существует.
        BadInputError: если у автора есть книги (каскадное удаление запрещено).
    """
    exists = queries.author_exists(db, id=author_id)
    if not exists:
        raise NotFoundError("Автор не найден")
    count = queries.count_author_books(db, id=author_id)["c"]
    if count > 0:
        raise BadInputError("Нельзя удалить автора с книгами")
    queries.delete_author(db, id=author_id)
