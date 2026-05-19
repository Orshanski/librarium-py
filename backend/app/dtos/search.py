"""TypedDicts and Response DTOs for /api/search query results."""
from typing import TypedDict

from pydantic import BaseModel

from ._aliases import RESPONSE_CONFIG
from ._refs import AuthorRef, SeriesRef


class SearchBookHit(TypedDict):
    id: int
    title: str
    cover_path: str | None
    authors: list[AuthorRef]
    series: SeriesRef | None
    # Card-level fields surfaced for BookCardItem-like rendering. To be unified
    # with BookCardItem in Task 4.2.e — for now we just widen SearchBookHit so
    # the wire response carries the new keys.
    series_number: float | None
    rating: int | None
    is_read: int | None


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

    Wire: {"books": [...], "authors": [...], "series": [...]}.
    Items serialize snake-keyed TypedDict fields to camelCase via alias_generator:
    cover_path → coverPath, book_count → bookCount.
    """
    model_config = RESPONSE_CONFIG

    books: list[SearchBookHit]
    authors: list[SearchAuthorHit]
    series: list[SearchSeriesHit]
