from ..database import get_db, dicts_from_rows, dict_from_row


def get_tags(top: int | None = None):
    db = get_db()
    if top:
        return dicts_from_rows(db.execute("""
            SELECT t.id, t.name, COUNT(bt.book_id) as book_count
            FROM tags t JOIN book_tags bt ON t.id = bt.tag_id
            GROUP BY t.id ORDER BY book_count DESC LIMIT :top
        """, {"top": top}).fetchall())
    return dicts_from_rows(db.execute("""
        SELECT t.id, t.name, COUNT(bt.book_id) as book_count
        FROM tags t JOIN book_tags bt ON t.id = bt.tag_id
        GROUP BY t.id ORDER BY book_count DESC
    """).fetchall())


def get_tag_by_id(tag_id: int, author_ids=None, series_ids=None, language=None, sort="added_desc"):
    db = get_db()
    tag = dict_from_row(db.execute("SELECT * FROM tags WHERE id = :id", {"id": tag_id}).fetchone())
    if not tag:
        return None

    clauses = ["bt2.tag_id = :id"]
    params: dict = {"id": tag_id}

    if author_ids:
        ph = ",".join(f":a{i}" for i in range(len(author_ids)))
        clauses.append(f"b.id IN (SELECT book_id FROM book_authors WHERE author_id IN ({ph}))")
        for i, v in enumerate(author_ids):
            params[f"a{i}"] = v

    if series_ids:
        ph = ",".join(f":s{i}" for i in range(len(series_ids)))
        clauses.append(f"b.series_id IN ({ph})")
        for i, v in enumerate(series_ids):
            params[f"s{i}"] = v

    if language:
        clauses.append("b.language = :lang")
        params["lang"] = language

    where = "WHERE " + " AND ".join(clauses)

    books = dicts_from_rows(db.execute(f"""
        SELECT b.*, s.name as series_name,
            GROUP_CONCAT(DISTINCT a.name) as authors,
            GROUP_CONCAT(DISTINCT t.name) as tags
        FROM books b
        JOIN book_tags bt2 ON b.id = bt2.book_id
        LEFT JOIN series s ON b.series_id = s.id
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        LEFT JOIN book_tags bt ON b.id = bt.book_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        {where} GROUP BY b.id ORDER BY b.added_at DESC
    """, params).fetchall())

    return {"tag": tag, "books": books}


def get_or_create_tag(name: str) -> int:
    db = get_db()
    row = db.execute("SELECT id FROM tags WHERE name = :name", {"name": name}).fetchone()
    if row:
        return row["id"]
    cur = db.execute("INSERT INTO tags (name) VALUES (:name)", {"name": name})
    db.commit()
    return cur.lastrowid
