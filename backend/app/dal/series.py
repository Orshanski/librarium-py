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
    s = dict_from_row(db.execute("SELECT * FROM series WHERE id = :id", {"id": series_id}).fetchone())
    if not s:
        return None

    books = dicts_from_rows(db.execute("""
        SELECT b.*, GROUP_CONCAT(DISTINCT a.name) as authors,
            GROUP_CONCAT(DISTINCT t.name) as tags
        FROM books b
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        LEFT JOIN book_tags bt ON b.id = bt.book_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        WHERE b.series_id = :id
        GROUP BY b.id ORDER BY b.series_number
    """, {"id": series_id}).fetchall())

    return {"series": s, "books": books}


def get_or_create_series(name: str) -> int:
    db = get_db()
    row = db.execute("SELECT id FROM series WHERE name = :name", {"name": name}).fetchone()
    if row:
        return row["id"]
    cur = db.execute("INSERT INTO series (name, sort_name) VALUES (:name, :sort)", {"name": name, "sort": name})
    db.commit()
    return cur.lastrowid


def rename_series(series_id: int, name: str):
    db = get_db()
    db.execute("UPDATE series SET name = :name, sort_name = :name WHERE id = :id", {"name": name, "id": series_id})
    db.commit()


def merge_series(target_id: int, source_id: int) -> int:
    """Переносит книги source → target, удаляет source. Возвращает кол-во перенесённых книг."""
    db = get_db()
    moved = db.execute("UPDATE books SET series_id = :target WHERE series_id = :source",
                       {"target": target_id, "source": source_id}).rowcount
    db.execute("DELETE FROM series WHERE id = :source", {"source": source_id})
    db.commit()
    return moved


def delete_series(series_id: int) -> bool:
    """Удаляет серию если у неё нет книг. Возвращает True если удалена."""
    db = get_db()
    count = db.execute("SELECT COUNT(*) as c FROM books WHERE series_id = :id", {"id": series_id}).fetchone()["c"]
    if count > 0:
        return False
    db.execute("DELETE FROM series WHERE id = :id", {"id": series_id})
    db.commit()
    return True


def search_series(query: str, exclude_id: int | None = None) -> list[dict]:
    db = get_db()
    rows = db.execute("""
        SELECT s.id, s.name, COUNT(b.id) as book_count
        FROM series s
        LEFT JOIN books b ON b.series_id = s.id
        WHERE s.name LIKE :q AND (:exclude IS NULL OR s.id != :exclude)
        GROUP BY s.id ORDER BY s.name LIMIT 10
    """, {"q": f"%{query}%", "exclude": exclude_id}).fetchall()
    return dicts_from_rows(rows)
