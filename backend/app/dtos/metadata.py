"""Metadata Response DTOs."""
from typing import Any

from pydantic import BaseModel


class MetadataSearchResponse(BaseModel):
    """Response for GET /api/metadata/search.

    Items are dicts produced by MetadataResult.to_dict() — a dataclass asdict()
    with stable fields (title, authors, description, publisher, pubDate, isbn,
    tags, source, coverUrl). Typed as list[Any] because MetadataResult lives in
    app/providers/ (not a DTO/TypedDict layer), and introducing a separate
    TypedDict here would duplicate the dataclass declaration with no gain.
    """
    results: list[Any]
