from ..database import get_db, dicts_from_rows, dict_from_row
from .filters import build_book_where, get_filter_options


def get_authors(tag_ids: list[int] | None = None, language: str | None = None):
    db = get_db()
    filters: dict = {}
    if tag_ids:
        filters["tagIds"] = tag_ids
    if language:
        filters["language"] = language

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

    return {
        "authors": authors,
        "filterOptions": {
            "tags": get_filter_options(filters, "tag"),
            "languages": get_filter_options(filters, "language"),
        },
    }


def get_author_by_id(author_id: int):
    db = get_db()
    author = dict_from_row(db.execute("SELECT * FROM authors WHERE id = :id", {"id": author_id}).fetchone())
    if not author:
        return None

    books = dicts_from_rows(db.execute("""
        SELECT b.*, s.name as series_name,
            GROUP_CONCAT(DISTINCT a2.name) as authors,
            GROUP_CONCAT(DISTINCT t.name) as tags
        FROM books b
        JOIN book_authors ba ON b.id = ba.book_id AND ba.author_id = :id
        LEFT JOIN series s ON b.series_id = s.id
        LEFT JOIN book_authors ba2 ON b.id = ba2.book_id
        LEFT JOIN authors a2 ON ba2.author_id = a2.id
        LEFT JOIN book_tags bt ON b.id = bt.book_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        GROUP BY b.id ORDER BY b.added_at DESC
    """, {"id": author_id}).fetchall())

    return {"author": author, "books": books}


def get_all_authors():
    """Author directory: id + name, sorted by sort_name."""
    db = get_db()
    return dicts_from_rows(db.execute(
        "SELECT id, name FROM authors ORDER BY sort_name COLLATE NOCASE"
    ).fetchall())


def _generate_sort_name(name: str) -> str:
    """Generate sort name by inverting 'First Last' -> 'Last, First'."""
    parts = name.strip().split()
    if len(parts) <= 1:
        return name.strip()
    return f"{parts[-1]}, {' '.join(parts[:-1])}"


def get_or_create_author(name: str) -> int:
    db = get_db()
    sort_name = _generate_sort_name(name)
    db.execute(
        "INSERT OR IGNORE INTO authors (name, sort_name) VALUES (:name, :sort)",
        {"name": name, "sort": sort_name},
    )
    row = db.execute("SELECT id FROM authors WHERE name = :name", {"name": name}).fetchone()
    return row["id"]


def rename_author(author_id: int, name: str):
    db = get_db()
    sort_name = _generate_sort_name(name)
    db.execute("UPDATE authors SET name = :name, sort_name = :sort WHERE id = :id", {"name": name, "sort": sort_name, "id": author_id})


def merge_authors(target_id: int, source_id: int):
    """Переносит книги source → target, удаляет source."""
    db = get_db()
    db.execute("""
        INSERT OR IGNORE INTO book_authors (book_id, author_id)
        SELECT book_id, :target FROM book_authors WHERE author_id = :source
    """, {"target": target_id, "source": source_id})
    db.execute("DELETE FROM book_authors WHERE author_id = :source", {"source": source_id})
    db.execute("DELETE FROM authors WHERE id = :source", {"source": source_id})


def delete_author(author_id: int) -> str | None:
    """Удаляет автора. Возвращает None если удалён, иначе причину ошибки."""
    db = get_db()
    exists = db.execute("SELECT 1 FROM authors WHERE id = :id", {"id": author_id}).fetchone()
    if not exists:
        return "not_found"
    count = db.execute("SELECT COUNT(*) as c FROM book_authors WHERE author_id = :id", {"id": author_id}).fetchone()["c"]
    if count > 0:
        return "has_books"
    db.execute("DELETE FROM authors WHERE id = :id", {"id": author_id})
    return None


