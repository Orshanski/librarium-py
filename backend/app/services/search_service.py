"""Catalog search — query normalization + delegation to DAL."""
import sqlite3

from ..dal import books as dal

_MAX_LIMIT = 100


def search(db: sqlite3.Connection, query: str, limit: int) -> dict:
    """Search books, authors, and series by query string.

    Returns dict with shape {"books": [...], "authors": [...], "series": [...]}.
    Empty query returns empty result.
    """
    q = query.strip()
    if not q:
        return {"books": [], "authors": [], "series": []}
    return dal.search_books(db, q, min(limit, _MAX_LIMIT))
