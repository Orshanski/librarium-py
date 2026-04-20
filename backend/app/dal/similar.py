import sqlite3
from pathlib import Path

import aiosql

from ..dtos.similar import SimilarCandidate

queries = aiosql.from_path(Path(__file__).parent / "queries" / "similar", "sqlite3")


def exclude_owned(db: sqlite3.Connection, candidates: list[SimilarCandidate]) -> list[SimilarCandidate]:
    """Filter out books that already exist in the library by title + first author."""
    if not candidates:
        return candidates

    # Build lookup set from candidate titles
    placeholders = ",".join(f":t{i}" for i in range(len(candidates)))
    params = {f"t{i}": c["title"].lower() for i, c in enumerate(candidates)}

    # SQL-safe: {placeholders} из whitelist-формата ":tN" для bind-имён;
    # значения (title lower) идут через bind. См. spec §Динамические фрагменты.
    final_sql = queries.exclude_owned.sql.replace("{placeholders}", placeholders)
    rows = db.execute(final_sql, params).fetchall()

    owned = {(r["title"], r["author"]) for r in rows}

    result = []
    for book in candidates:
        title = book["title"].lower()
        first_author = book["authors"].split(",")[0].strip().lower() if book["authors"] else ""
        if (title, first_author) not in owned:
            result.append(book)
    return result
