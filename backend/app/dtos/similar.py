"""Similar books TypedDicts and Response DTOs."""
from typing import TypedDict

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Provider-boundary TypedDict — crosses provider → service → DAL → router.
# ---------------------------------------------------------------------------


class SimilarCandidate(TypedDict):
    """Shape of items returned by providers.litres.fetch_similar.

    Crosses provider -> similar_service -> dal.similar.exclude_owned ->
    service -> router boundary.

    coverUrl is "" (empty string) when unavailable — litres.py never yields
    None here. rating/ratingCount are always present (filter enforces
    rating_count >= 5 before appending).
    """
    title: str
    authors: str
    coverUrl: str
    litresUrl: str
    rating: float
    ratingCount: int


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only.
# ---------------------------------------------------------------------------


class SimilarResponse(BaseModel):
    """Response for GET /api/books/{book_id}/similar.

    Wire format: {"books": [...], "source": str, "error": str | None}
    Items are SimilarCandidate TypedDicts (title, authors, coverUrl,
    litresUrl, rating, ratingCount).
    """
    books: list[SimilarCandidate]
    source: str
    error: str | None = None
