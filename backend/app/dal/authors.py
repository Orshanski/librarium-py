from ..database import get_db, dicts_from_rows, dict_from_row


def get_authors(tag_ids: list[int] | None = None, language: str | None = None):
    db = get_db()
    clauses, params = [], {}

    if tag_ids:
        ph = ",".join(f":t{i}" for i in range(len(tag_ids)))
        clauses.append(f"b.id IN (SELECT book_id FROM book_tags WHERE tag_id IN ({ph}))")
        for i, v in enumerate(tag_ids):
            params[f"t{i}"] = v

    if language:
        clauses.append("b.language = :lang")
        params["lang"] = language

    where = "WHERE " + " AND ".join(clauses) if clauses else ""

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

    # Filter options (excluding own filter)
    tag_opts = dicts_from_rows(db.execute(f"""
        SELECT t.id as value, t.name as label, COUNT(DISTINCT b.id) as count
        FROM tags t JOIN book_tags bt ON t.id = bt.tag_id JOIN books b ON bt.book_id = b.id
        JOIN book_authors ba ON b.id = ba.book_id
        {"WHERE b.language = :lang" if language else ""}
        GROUP BY t.id ORDER BY count DESC
    """, {"lang": language} if language else {}).fetchall())

    lp = {k: v for k, v in params.items() if k != "lang"}
    lc = [c for c in clauses if "language" not in c]
    lw = "WHERE " + " AND ".join(lc) + " AND b.language IS NOT NULL" if lc else "WHERE b.language IS NOT NULL"
    lang_opts = dicts_from_rows(db.execute(f"""
        SELECT b.language as value, COUNT(DISTINCT b.id) as count
        FROM books b JOIN book_authors ba ON b.id = ba.book_id
        {lw} GROUP BY b.language ORDER BY count DESC
    """, lp).fetchall())

    return {"authors": authors, "filterOptions": {"tags": tag_opts, "languages": lang_opts}}


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


