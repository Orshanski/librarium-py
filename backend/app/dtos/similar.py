"""Similar books TypedDicts and Response DTOs."""
from typing import TypedDict

from pydantic import BaseModel

from ._aliases import RESPONSE_CONFIG


# ---------------------------------------------------------------------------
# Provider-boundary TypedDict — crosses provider → service → DAL → router.
# ---------------------------------------------------------------------------


class SimilarCandidate(TypedDict):
    """Shape of items returned by providers.litres.fetch_similar.

    Crosses provider -> similar_service -> dal.similar.exclude_owned ->
    service -> router boundary.

    cover_url is "" (empty string) when unavailable — litres.py never yields
    None here. rating/rating_count are always present (filter enforces
    rating_count >= 5 before appending).

    Snake-keyed; на wire эмитятся в camelCase через alias_generator
    родительской SimilarResponse.
    """
    title: str
    authors: str
    cover_url: str
    litres_url: str
    rating: float
    rating_count: int


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only.
# ---------------------------------------------------------------------------


class SimilarResponse(BaseModel):
    """Response for GET /api/books/{book_id}/similar.

    Wire format (camelCase): {"books": [...], "source": str, "error": str | None}
    Items are SimilarCandidate TypedDicts (snake fields, camel wire).
    """
    model_config = RESPONSE_CONFIG

    books: list[SimilarCandidate]
    source: str
    error: str | None = None
