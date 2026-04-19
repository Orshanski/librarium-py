"""Catalog search — query normalization + delegation to DAL."""
import sqlite3

from ..dal import books as dal
from ..dtos.search import SearchResponse

_MAX_LIMIT = 100


def search(db: sqlite3.Connection, query: str, limit: int) -> SearchResponse:
    """Search books, authors, and series by query string.

    Returns SearchResponse with shape {"books": [...], "authors": [...], "series": [...]}.
    Empty query returns empty result.
    """
    q = query.strip()
    if not q:
        return SearchResponse(books=[], authors=[], series=[])
    result = dal.search_books(db, q, min(limit, _MAX_LIMIT))
    return SearchResponse(books=result["books"], authors=result["authors"], series=result["series"])
