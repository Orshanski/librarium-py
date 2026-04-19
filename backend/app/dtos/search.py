"""TypedDicts and Response DTOs for /api/search."""
from typing import TypedDict


class SearchBookHit(TypedDict):
    id: int
    title: str
    cover_path: str | None
    authors: str | None
    series_name: str | None


class SearchAuthorHit(TypedDict):
    id: int
    name: str | None
    book_count: int


class SearchSeriesHit(TypedDict):
    id: int
    name: str
    book_count: int
    authors: str | None


class SearchResults(TypedDict):
    books: list[SearchBookHit]
    authors: list[SearchAuthorHit]
    series: list[SearchSeriesHit]
