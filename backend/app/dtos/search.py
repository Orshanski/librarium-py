"""TypedDicts and Response DTOs for /api/search query results."""
from typing import TypedDict

from pydantic import BaseModel

from ._aliases import RESPONSE_CONFIG
from ._refs import AuthorRef, SeriesRef
from .book_card import BookCardItem


class SearchBookHit(TypedDict):
    """DAL-internal row shape for search book results.

    Describes the narrow 9-column row produced by `search_books_books.sql`
    (id, title, cover_path, series_number, updated_at, series, authors,
    rating, is_read) and consumed by `dal.search_books` as the type of
    `SearchResults.books`. The service layer maps each row through
    `row_to_book_card_item` before exposing it on the wire; the response
    DTO uses `BookCardItem` to match the unified card-level contract.

    Kept (not collapsed into `BookListRow`) on purpose: the search SELECT is
    deliberately narrow and does not fetch description/language/publisher/
    pub_date/sort_title/added_at/tags. Reusing the wider `BookListRow`
    (16 fields) here would be a structural lie about what the DAL returns.
    """
    id: int
    title: str
    cover_path: str | None
    authors: list[AuthorRef]
    series: SeriesRef | None
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
    `books[]` follows the unified `BookCardItem` shape (same contract as
    catalog/author/series/tag/shelf list responses). Author and series hits
    keep their own TypedDict shapes — they describe entity rows, not cards.
    Items serialize snake-keyed fields to camelCase via alias_generator:
    cover_path → coverPath, book_count → bookCount.
    """
    model_config = RESPONSE_CONFIG

    books: list[BookCardItem]
    authors: list[SearchAuthorHit]
    series: list[SearchSeriesHit]
