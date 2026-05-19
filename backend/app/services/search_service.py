"""Catalog search — query normalization + delegation to DAL."""
import sqlite3

from ..dal import books as dal
from ..dtos.search import SearchResponse
from .book_item_builder import row_to_book_card_item

_MAX_LIMIT = 100


def search(db: sqlite3.Connection, query: str, limit: int, user_id: int) -> SearchResponse:
    """Search books, authors, and series by query string.

    Returns SearchResponse with shape {"books": [...], "authors": [...], "series": [...]}.
    Empty query returns empty result.

    `books[]` is mapped through `row_to_book_card_item` — the unified
    card-level contract (BookCardItem); same shape as catalog/author/series/
    tag/shelf list endpoints.

    `user_id` is required so book hits can carry per-user rating/is_read joined
    from user_books — kept as keyword for the DAL call to match the SQL bind name.
    """
    q = query.strip()
    if not q:
        return SearchResponse(books=[], authors=[], series=[])
    result = dal.search_books(db, q, min(limit, _MAX_LIMIT), user_id=user_id)
    books = [row_to_book_card_item(r) for r in result["books"]]
    return SearchResponse(books=books, authors=result["authors"], series=result["series"])
