import sqlite3

from ..database import dicts_from_rows, dict_from_row
from ..dtos.catalog import CatalogFilters
from ..exceptions import BadInputError, NotFoundError
from .book_list_query import BOOK_LIST_JOINS, BOOK_LIST_AGGREGATE_COLUMNS
from .filters import build_book_where


def get_authors(db: sqlite3.Connection, tag_ids: list[int] | None = None, language: str | None = None, user_id: int | None = None):
    filters: dict = {}
    if tag_ids:
        filters["tagIds"] = tag_ids
    if language:
        filters["language"] = language
    if user_id:
        filters["userId"] = user_id

    where, params = build_book_where(filters)

    authors = dicts_from_rows(db.execute(f"""
        SELECT a.id, a.name, a.sort_name, COUNT(DISTINCT b.id) as book_count,
            GROUP_CONCAT(DISTINCT t.name) as tags
        FROM authors a
        JOIN book_authors ba ON a.id = ba.author_id
        JOIN books b ON ba.book_id = b.id
        LEFT JOIN book_tags bt ON b.id = bt.book_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        {where} GROUP BY a.id ORDER BY a.sort_name COLLATE NOCASE
    """, params).fetchall())

    return {"authors": authors}


def list_author_options(db: sqlite3.Connection, filters: CatalogFilters) -> list[dict]:
    """Author options for filter bar, scoped by other filters."""
    where, params = build_book_where(filters, exclude="authorIds")
    return dicts_from_rows(db.execute(f"""
        SELECT DISTINCT a.id, a.name FROM authors a
        JOIN book_authors ba ON a.id = ba.author_id
        JOIN books b ON ba.book_id = b.id
        {where} ORDER BY a.sort_name COLLATE NOCASE
    """, params).fetchall())


def get_author_by_id(db: sqlite3.Connection, author_id: int):
    author = dict_from_row(db.execute(
        "SELECT * FROM authors WHERE id = :id", {"id": author_id}
    ).fetchone())
    if not author:
        return None

    books = dicts_from_rows(db.execute(f"""
        SELECT {BOOK_LIST_AGGREGATE_COLUMNS}
        FROM books b
        JOIN book_authors ba_scope ON b.id = ba_scope.book_id AND ba_scope.author_id = :id
        {BOOK_LIST_JOINS}
        GROUP BY b.id ORDER BY b.added_at DESC
    """, {"id": author_id}).fetchall())

    return {"author": author, "books": books}


def _generate_sort_name(name: str) -> str:
    """Generate sort name by inverting 'First Last' -> 'Last, First'."""
    parts = name.strip().split()
    if len(parts) <= 1:
        return name.strip()
    return f"{parts[-1]}, {' '.join(parts[:-1])}"


def get_or_create_author(db: sqlite3.Connection, name: str) -> int:
    sort_name = _generate_sort_name(name)
    db.execute(
        "INSERT OR IGNORE INTO authors (name, sort_name) VALUES (:name, :sort)",
        {"name": name, "sort": sort_name},
    )
    row = db.execute("SELECT id FROM authors WHERE name = :name", {"name": name}).fetchone()
    return row["id"]


def rename_author(db: sqlite3.Connection, author_id: int, name: str):
    sort_name = _generate_sort_name(name)
    db.execute("UPDATE authors SET name = :name, sort_name = :sort WHERE id = :id", {"name": name, "sort": sort_name, "id": author_id})


def merge_authors(db: sqlite3.Connection, target_id: int, source_id: int):
    """Переносит книги source -> target, удаляет source."""
    db.execute("""
        INSERT OR IGNORE INTO book_authors (book_id, author_id)
        SELECT book_id, :target FROM book_authors WHERE author_id = :source
    """, {"target": target_id, "source": source_id})
    db.execute("DELETE FROM book_authors WHERE author_id = :source", {"source": source_id})
    db.execute("DELETE FROM authors WHERE id = :source", {"source": source_id})


def delete_author(db: sqlite3.Connection, author_id: int) -> None:
    """Удаляет автора.

    Raises:
        NotFoundError: если автор не существует.
        BadInputError: если у автора есть книги (каскадное удаление запрещено).
    """
    exists = db.execute("SELECT 1 FROM authors WHERE id = :id", {"id": author_id}).fetchone()
    if not exists:
        raise NotFoundError("Автор не найден")
    count = db.execute("SELECT COUNT(*) as c FROM book_authors WHERE author_id = :id", {"id": author_id}).fetchone()["c"]
    if count > 0:
        raise BadInputError("Нельзя удалить автора с книгами")
    db.execute("DELETE FROM authors WHERE id = :id", {"id": author_id})
