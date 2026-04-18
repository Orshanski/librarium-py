"""Similar books via Litres (unofficial) — graceful degradation on upstream errors."""
import logging
import sqlite3

from ..dal import books as books_dal
from ..dal import similar as similar_dal
from ..exceptions import NotFoundError
from ..providers.litres import fetch_similar, find_litres_id

log = logging.getLogger("librarium.similar")

_SOURCE = "litres"


def get_similar(db: sqlite3.Connection, book_id: int) -> dict:
    book = books_dal.get_book_by_id(db, book_id)
    if not book:
        raise NotFoundError("Not found")

    title = book["title"]
    authors = book.get("authors") or ""
    first_author = authors.split(",")[0].strip() if authors else ""
    query = f"{title} {first_author}".strip()

    try:
        litres_id = find_litres_id(query, title)
        if not litres_id:
            return {"books": [], "source": _SOURCE, "error": None}
        similar = fetch_similar(litres_id)
        similar = similar_dal.exclude_owned(db, similar)
        return {"books": similar, "source": _SOURCE, "error": None}
    except Exception as e:
        # Third-party/network errors — graceful degrade (UX decision, legacy).
        log.warning("Similar books error for book_id=%d: %s", book_id, e)
        return {"books": [], "source": _SOURCE, "error": "service_unavailable"}
