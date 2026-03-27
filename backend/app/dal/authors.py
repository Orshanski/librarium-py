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

    lang_opts = dicts_from_rows(db.execute(f"""
        SELECT b.language as value, COUNT(DISTINCT b.id) as count
        FROM books b JOIN book_authors ba ON b.id = ba.book_id
        {"WHERE " + " AND ".join(c for c in clauses if "language" not in c) if [c for c in clauses if "language" not in c] else ""}
        {"WHERE" if not [c for c in clauses if "language" not in c] else "AND"} b.language IS NOT NULL
        GROUP BY b.language ORDER BY count DESC
    """, {k: v for k, v in params.items() if "lang" not in k}).fetchall()) if True else []

    # Simpler approach for lang opts
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


def get_or_create_author(name: str) -> int:
    db = get_db()
    row = db.execute("SELECT id FROM authors WHERE name = :name", {"name": name}).fetchone()
    if row:
        return row["id"]
    cur = db.execute("INSERT INTO authors (name, sort_name) VALUES (:name, :sort)", {"name": name, "sort": name})
    db.commit()
    return cur.lastrowid
