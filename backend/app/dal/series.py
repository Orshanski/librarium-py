import sqlite3

from ..database import dicts_from_rows, dict_from_row
from ..dtos.catalog import CatalogFilters
from ..exceptions import BadInputError, NotFoundError
from .book_list_query import BOOK_LIST_JOINS, BOOK_LIST_AGGREGATE_COLUMNS
from .filters import build_book_where


def list_series_options(db: sqlite3.Connection, filters: CatalogFilters) -> list[dict]:
    """Series options for filter bar, scoped by other filters."""
    where, params = build_book_where(filters, exclude="seriesIds")
    return dicts_from_rows(db.execute(f"""
        SELECT DISTINCT s.id, s.name FROM series s
        JOIN books b ON b.series_id = s.id
        {where} ORDER BY s.name COLLATE NOCASE
    """, params).fetchall())


def get_series(db: sqlite3.Connection, *, user_id: int, author_ids: list[int] | None = None, tag_ids: list[int] | None = None, language: str | None = None):
    filters: CatalogFilters = {"userId": user_id}
    if author_ids:
        filters["authorIds"] = author_ids
    if tag_ids:
        filters["tagIds"] = tag_ids
    if language:
        filters["language"] = language

    where, params = build_book_where(filters)

    series = dicts_from_rows(db.execute(f"""
        SELECT s.id, s.name, s.sort_name, COUNT(DISTINCT b.id) as book_count,
            GROUP_CONCAT(DISTINCT a.name) as authors
        FROM series s
        JOIN books b ON b.series_id = s.id
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        {where} GROUP BY s.id
    """, params).fetchall())

    return {"series": series}


def get_series_by_id(db: sqlite3.Connection, series_id: int):
    s = dict_from_row(db.execute("""
        SELECT s.*, COUNT(b.id) as book_count
        FROM series s
        LEFT JOIN books b ON b.series_id = s.id
        WHERE s.id = :id
        GROUP BY s.id
    """, {"id": series_id}).fetchone())
    if not s:
        return None

    books = dicts_from_rows(db.execute(f"""
        SELECT {BOOK_LIST_AGGREGATE_COLUMNS}
        FROM books b
        {BOOK_LIST_JOINS}
        WHERE b.series_id = :id
        GROUP BY b.id ORDER BY b.series_number
    """, {"id": series_id}).fetchall())

    return {"series": s, "books": books}


def get_or_create_series(db: sqlite3.Connection, name: str) -> int:
    db.execute("INSERT OR IGNORE INTO series (name, sort_name) VALUES (:name, :sort)", {"name": name, "sort": name})
    row = db.execute("SELECT id FROM series WHERE name = :name", {"name": name}).fetchone()
    return row["id"]


def rename_series(db: sqlite3.Connection, series_id: int, name: str):
    db.execute("UPDATE series SET name = :name, sort_name = :name WHERE id = :id", {"name": name, "id": series_id})


def merge_series(db: sqlite3.Connection, target_id: int, source_id: int):
    """Переносит книги source -> target, удаляет source."""
    db.execute("UPDATE books SET series_id = :target WHERE series_id = :source",
               {"target": target_id, "source": source_id})
    db.execute("DELETE FROM series WHERE id = :source", {"source": source_id})


def delete_series(db: sqlite3.Connection, series_id: int) -> None:
    """Удаляет серию.

    Raises:
        NotFoundError: если серия не существует.
        BadInputError: если у серии есть книги (каскадное удаление запрещено).
    """
    exists = db.execute("SELECT 1 FROM series WHERE id = :id", {"id": series_id}).fetchone()
    if not exists:
        raise NotFoundError("Серия не найдена")
    count = db.execute("SELECT COUNT(*) as c FROM books WHERE series_id = :id", {"id": series_id}).fetchone()["c"]
    if count > 0:
        raise BadInputError("Нельзя удалить серию с книгами")
    db.execute("DELETE FROM series WHERE id = :id", {"id": series_id})
