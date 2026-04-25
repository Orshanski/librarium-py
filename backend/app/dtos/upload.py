"""Upload request DTOs and Response DTOs."""
from pydantic import BaseModel, Field

from ._types import TempIdStr
from .books import DuplicateHit


class CreateBookMetadata(BaseModel):
    title: str
    authors: str = ""
    series: str = ""
    seriesNumber: str = ""
    description: str = ""
    language: str = ""
    tags: str = ""
    publisher: str = ""
    pubDate: str = ""
    isbn: str = ""
    coverUrl: str | None = None


class CreateBookBody(BaseModel):
    tempId: TempIdStr
    metadata: CreateBookMetadata = Field(default_factory=CreateBookMetadata)


class AddFormatBody(BaseModel):
    tempId: TempIdStr


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only.
# ---------------------------------------------------------------------------


class UploadParseResponse(BaseModel):
    """Response for POST /api/upload.

    Wire format:
    {
        "tempId": str,
        "format": str,
        "metadata": {title, authors, series, seriesNumber, description,
                     language, tags, publisher, pubDate, isbn, coverUrl},
        "duplicate": {id, title, authors} | null
    }
    """
    tempId: str
    format: str
    metadata: CreateBookMetadata
    duplicate: DuplicateHit | None = None


class CreateBookResponse(BaseModel):
    """Response for POST /api/books/create."""
    bookId: int


class AddFormatResponse(BaseModel):
    """Response for POST /api/books/{book_id}/add-format."""
    ok: bool = True
    format: str
