"""Metadata Response DTOs."""
from typing import TypedDict

from pydantic import BaseModel

from ._aliases import RESPONSE_CONFIG


class MetadataResultDict(TypedDict, total=False):
    """Shape of MetadataResult.to_dict() output — mirror of the providers-
    layer dataclass for DTO-layer typing без cross-layer import.

    Fields match MetadataResult dataclass fields exactly
    (app/providers/__init__.py). Все str; dataclass использует "" как default.
    total=False — Pydantic валидирует входящие dicts по этому TypedDict, и
    частично заполненные dicts (например в тестах) не должны падать в validation.
    Snake-keyed; на wire эмитятся в camelCase через alias_generator родительской
    MetadataSearchResponse (Pydantic v2 пробрасывает alias_generator на nested
    TypedDict).
    """
    title: str
    authors: str
    description: str
    publisher: str
    pub_date: str
    isbn: str
    tags: str
    source: str
    cover_url: str


class MetadataSearchResponse(BaseModel):
    """Response for GET /api/metadata/search.

    Items are dicts produced by MetadataResult.to_dict() — a dataclass asdict()
    with stable fields matching MetadataResultDict.
    """
    model_config = RESPONSE_CONFIG

    results: list[MetadataResultDict]
