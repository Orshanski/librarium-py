"""Metadata Response DTOs."""
from typing import TypedDict

from pydantic import BaseModel


class MetadataResultDict(TypedDict, total=False):
    """Shape of MetadataResult.to_dict() output — mirror of the providers-
    layer dataclass for DTO-layer typing without cross-layer import.

    Fields match MetadataResult dataclass fields exactly
    (app/providers/__init__.py). All are str; the dataclass uses "" as the
    default for every field. total=False because Pydantic validates inbound
    dicts against this TypedDict, and partially-populated dicts (e.g. in
    tests) must not raise validation errors.
    """
    title: str
    authors: str
    description: str
    publisher: str
    pubDate: str
    isbn: str
    tags: str
    source: str
    coverUrl: str


class MetadataSearchResponse(BaseModel):
    """Response for GET /api/metadata/search.

    Items are dicts produced by MetadataResult.to_dict() — a dataclass asdict()
    with stable fields matching MetadataResultDict.
    """
    results: list[MetadataResultDict]
