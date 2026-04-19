"""Similar books Response DTOs."""
from typing import Any

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only.
# ---------------------------------------------------------------------------


class SimilarResponse(BaseModel):
    """Response for GET /api/books/{book_id}/similar.

    Wire format: {"books": [...], "source": str, "error": str | None}
    Items are dicts from litres provider with camelCase keys (title, authors,
    coverUrl, litresUrl, rating, ratingCount) — pre-L4 shape preserved.
    """
    books: list[Any]
    source: str
    error: str | None = None
