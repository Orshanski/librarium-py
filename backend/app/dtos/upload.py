"""Upload request DTOs and Response DTOs."""
from pydantic import BaseModel, Field

from ._aliases import BODY_CONFIG, RESPONSE_CONFIG
from ._types import TempIdStr
from .books import DuplicateHit


class CreateBookMetadata(BaseModel):
    model_config = RESPONSE_CONFIG

    title: str
    authors: str = ""
    series: str = ""
    series_number: str = ""
    description: str = ""
    language: str = ""
    tags: str = ""
    publisher: str = ""
    pub_date: str = ""
    isbn: str = ""
    cover_url: str | None = None


class CreateBookBody(BaseModel):
    model_config = BODY_CONFIG

    temp_id: TempIdStr
    metadata: CreateBookMetadata = Field(default_factory=CreateBookMetadata)


class AddFormatBody(BaseModel):
    model_config = BODY_CONFIG

    temp_id: TempIdStr


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only.
# ---------------------------------------------------------------------------


class UploadParseResponse(BaseModel):
    """Response for POST /api/upload.

    Wire: {tempId, format, metadata: {title, authors, series, seriesNumber,
    description, language, tags, publisher, pubDate, isbn, coverUrl},
    duplicate: {id, title, authors} | null}.
    """
    model_config = RESPONSE_CONFIG

    temp_id: str
    format: str
    metadata: CreateBookMetadata
    duplicate: DuplicateHit | None = None


class CreateBookResponse(BaseModel):
    """Response for POST /api/books/create."""
    model_config = RESPONSE_CONFIG

    book_id: int


class AddFormatResponse(BaseModel):
    """Response for POST /api/books/{book_id}/add-format."""
    model_config = RESPONSE_CONFIG

    ok: bool = True
    format: str
