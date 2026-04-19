import sqlite3

from ..dtos.similar import SimilarCandidate


def exclude_owned(db: sqlite3.Connection, candidates: list[SimilarCandidate]) -> list[SimilarCandidate]:
    """Filter out books that already exist in the library by title + first author."""
    if not candidates:
        return candidates

    # Build lookup set from candidate titles
    placeholders = ",".join(f":t{i}" for i in range(len(candidates)))
    params = {f"t{i}": c["title"].lower() for i, c in enumerate(candidates)}

    rows = db.execute(f"""
        SELECT lower_utf8(b.title) as title, lower_utf8(MIN(a.name)) as author
        FROM books b
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        WHERE lower_utf8(b.title) IN ({placeholders})
        GROUP BY b.id
    """, params).fetchall()

    owned = {(r["title"], r["author"]) for r in rows}

    result = []
    for book in candidates:
        title = book["title"].lower()
        first_author = book["authors"].split(",")[0].strip().lower() if book["authors"] else ""
        if (title, first_author) not in owned:
            result.append(book)
    return result
