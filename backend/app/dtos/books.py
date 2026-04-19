"""Book request DTOs and write-input TypedDicts."""
from typing import NotRequired, TypedDict

from pydantic import BaseModel


class UpdateBookBody(BaseModel):
    title: str | None = None
    description: str | None = None
    language: str | None = None
    publisher: str | None = None
    pubDate: str | None = None
    seriesId: int | str | None = None
    seriesNumber: float | None = None
    authorIds: list[int | str] | None = None
    tagIds: list[int | str] | None = None
    isbn: str | None = None


class BookCreateData(TypedDict):
    """Write-data for `dal.books.create_book`. Built in upload_service from
    CreateBookMetadata + resolved author/series/tag IDs."""
    title: str
    sort_title: NotRequired[str]
    description: NotRequired[str | None]
    language: NotRequired[str | None]
    publisher: NotRequired[str | None]
    pub_date: NotRequired[str | None]
    series_id: NotRequired[int | None]
    series_number: NotRequired[float | None]
    cover_path: NotRequired[str | None]
    author_ids: list[int]
    tag_ids: list[int]


class BookUpdateData(TypedDict, total=False):
    """Write-data for `dal.books.update_book`. Partial — only provided keys
    are updated. `total=False` because every field is optional for PATCH
    semantics (matches `UpdateBookBody.model_dump(exclude_unset=True)`)."""
    title: str | None
    description: str | None
    language: str | None
    publisher: str | None
    pubDate: str | None
    seriesId: int | str | None
    seriesNumber: float | None
    authorIds: list[int | str]
    tagIds: list[int | str]
    isbn: str | None
    sortTitle: str
    coverPath: str
