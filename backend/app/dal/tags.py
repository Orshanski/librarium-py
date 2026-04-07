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


def resolve_raw_tag(raw_tag: str) -> int:
    """Resolve raw genre code to tag_id via tag_mappings.
    If unknown — create tag + mapping."""
    db = get_db()
    row = db.execute(
        "SELECT tag_id FROM tag_mappings WHERE raw_tag = :raw COLLATE NOCASE",
        {"raw": raw_tag},
    ).fetchone()
    if row:
        return row["tag_id"]
    tag_id = get_or_create_tag(raw_tag)
    db.execute(
        "INSERT OR IGNORE INTO tag_mappings (raw_tag, tag_id) VALUES (:raw, :tid)",
        {"raw": raw_tag, "tid": tag_id},
    )
    return tag_id


def _capitalize_tag(name: str) -> str:
    """Capitalize first letter, leave the rest untouched.

    Special case: if the string is ALL-CAPS and longer than 4 chars, lowercase
    everything after the first letter (SCIENCE FICTION -> Science fiction).
    Acronyms up to 4 chars (AI, SQL, HTTP, REST) are preserved.
    """
    s = name.strip()
    if not s:
        return s
    if len(s) > 4 and s == s.upper() and any(c.isalpha() for c in s):
        return s[0] + s[1:].lower()
    return s[0].upper() + s[1:]


def resolve_tag_names(raw_tags: list[str]) -> list[str]:
    """Resolve raw genre codes to human-readable tag names.
    Unknown tags pass through as-is (with first letter capitalized)."""
    if not raw_tags:
        return []
    db = get_db()
    result = []
    for raw in raw_tags:
        row = db.execute(
            "SELECT t.name FROM tag_mappings m JOIN tags t ON m.tag_id = t.id WHERE m.raw_tag = :raw COLLATE NOCASE",
            {"raw": raw},
        ).fetchone()
        result.append(row["name"] if row else _capitalize_tag(raw))
    return result


def map_tag(tag_id: int, target_name: str) -> dict:
    """Map tag to target (rename or merge).
    Returns {"renamed": bool, "target_id": int}."""
    db = get_db()
    target_name = target_name.strip()
    existing = db.execute(
        "SELECT id FROM tags WHERE name = :name AND id != :id",
        {"name": target_name, "id": tag_id},
    ).fetchone()

    if existing:
        target_id = existing["id"]
        db.execute("""
            INSERT OR IGNORE INTO book_tags (book_id, tag_id)
            SELECT book_id, :target FROM book_tags WHERE tag_id = :source
        """, {"target": target_id, "source": tag_id})
        db.execute("DELETE FROM book_tags WHERE tag_id = :source", {"source": tag_id})
        db.execute("UPDATE tag_mappings SET tag_id = :target WHERE tag_id = :source",
                   {"target": target_id, "source": tag_id})
        db.execute("DELETE FROM tags WHERE id = :source", {"source": tag_id})
        return {"renamed": False, "target_id": target_id}
    else:
        db.execute("UPDATE tags SET name = :name WHERE id = :id",
                   {"name": target_name, "id": tag_id})
        return {"renamed": True, "target_id": tag_id}


def get_or_create_tag(name: str) -> int:
    db = get_db()
    db.execute("INSERT OR IGNORE INTO tags (name) VALUES (:name)", {"name": name})
    row = db.execute("SELECT id FROM tags WHERE name = :name", {"name": name}).fetchone()
    return row["id"]
