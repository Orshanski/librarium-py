"""TypedDicts and Response DTOs for /api/search query results."""
from typing import TypedDict

from pydantic import BaseModel

from ._refs import AuthorRef, SeriesRef


class SearchBookHit(TypedDict):
    id: int
    title: str
    cover_path: str | None
    authors: list[AuthorRef]
    series: SeriesRef | None


class SearchAuthorHit(TypedDict):
    id: int
    name: str  # authors.name is TEXT NOT NULL per schema
    book_count: int


class SearchSeriesHit(TypedDict):
    id: int
    name: str
    book_count: int
    authors: list[AuthorRef]


class SearchResults(TypedDict):
    books: list[SearchBookHit]
    authors: list[SearchAuthorHit]
    series: list[SearchSeriesHit]


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only.
# ---------------------------------------------------------------------------


class SearchResponse(BaseModel):
    """Response for GET /api/search.

    Wire format: {"books": [...], "authors": [...], "series": [...]}
    Items are raw SearchBookHit / SearchAuthorHit / SearchSeriesHit dicts
    (snake_case) — preserving pre-L4 wire format.
    """
    books: list[SearchBookHit]
    authors: list[SearchAuthorHit]
    series: list[SearchSeriesHit]
