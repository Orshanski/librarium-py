from ..database import get_db, dicts_from_rows, dict_from_row


def get_series(author_ids: list[int] | None = None, tag_ids: list[int] | None = None, language: str | None = None):
    db = get_db()
    clauses, params = [], {}

    if author_ids:
        ph = ",".join(f":a{i}" for i in range(len(author_ids)))
        clauses.append(f"b.id IN (SELECT book_id FROM book_authors WHERE author_id IN ({ph}))")
        for i, v in enumerate(author_ids):
            params[f"a{i}"] = v

    if tag_ids:
        ph = ",".join(f":t{i}" for i in range(len(tag_ids)))
        clauses.append(f"b.id IN (SELECT book_id FROM book_tags WHERE tag_id IN ({ph}))")
        for i, v in enumerate(tag_ids):
            params[f"t{i}"] = v

    if language:
        clauses.append("b.language = :lang")
        params["lang"] = language

    where = "WHERE " + " AND ".join(clauses) if clauses else ""

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


def get_series_by_id(series_id: int):
    db = get_db()
    s = dict_from_row(db.execute("""
        SELECT s.*, COUNT(b.id) as book_count
        FROM series s
        LEFT JOIN books b ON b.series_id = s.id
        WHERE s.id = :id
        GROUP BY s.id
    """, {"id": series_id}).fetchone())
    if not s:
        return None

    books = dicts_from_rows(db.execute("""
        SELECT b.*, s.name as series_name,
            GROUP_CONCAT(DISTINCT a.name) as authors,
            GROUP_CONCAT(DISTINCT t.name) as tags
        FROM books b
        LEFT JOIN series s ON b.series_id = s.id
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        LEFT JOIN book_tags bt ON b.id = bt.book_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        WHERE b.series_id = :id
        GROUP BY b.id ORDER BY b.series_number
    """, {"id": series_id}).fetchall())

    return {"series": s, "books": books}


def get_or_create_series(name: str, commit: bool = True) -> int:
    db = get_db()
    db.execute("INSERT OR IGNORE INTO series (name, sort_name) VALUES (:name, :sort)", {"name": name, "sort": name})
    if commit:
        db.commit()
    return db.execute("SELECT id FROM series WHERE name = :name", {"name": name}).fetchone()["id"]


def rename_series(series_id: int, name: str):
    db = get_db()
    db.execute("UPDATE series SET name = :name, sort_name = :name WHERE id = :id", {"name": name, "id": series_id})
    db.commit()


def merge_series(target_id: int, source_id: int):
    """Переносит книги source → target, удаляет source."""
    db = get_db()
    try:
        db.execute("UPDATE books SET series_id = :target WHERE series_id = :source",
                   {"target": target_id, "source": source_id})
        db.execute("DELETE FROM series WHERE id = :source", {"source": source_id})
        db.commit()
    except:
        db.rollback()
        raise


def delete_series(series_id: int) -> str | None:
    """Удаляет серию. Возвращает None если удалена, иначе причину ошибки."""
    db = get_db()
    exists = db.execute("SELECT 1 FROM series WHERE id = :id", {"id": series_id}).fetchone()
    if not exists:
        return "not_found"
    count = db.execute("SELECT COUNT(*) as c FROM books WHERE series_id = :id", {"id": series_id}).fetchone()["c"]
    if count > 0:
        return "has_books"
    db.execute("DELETE FROM series WHERE id = :id", {"id": series_id})
    db.commit()
    return None


