"""Catalog search — query normalization + delegation to DAL."""
import sqlite3

from ..dal import books as dal
from ..dtos.search import SearchResponse

_MAX_LIMIT = 100


def search(db: sqlite3.Connection, query: str, limit: int, user_id: int) -> SearchResponse:
    """Search books, authors, and series by query string.

    Returns SearchResponse with shape {"books": [...], "authors": [...], "series": [...]}.
    Empty query returns empty result.

    `user_id` is required so book hits can carry per-user rating/is_read joined
    from user_books — kept as keyword for the DAL call to match the SQL bind name.
    """
    q = query.strip()
    if not q:
        return SearchResponse(books=[], authors=[], series=[])
    result = dal.search_books(db, q, min(limit, _MAX_LIMIT), user_id=user_id)
    return SearchResponse(books=result["books"], authors=result["authors"], series=result["series"])
