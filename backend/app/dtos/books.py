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


# ---------------------------------------------------------------------------
# Read-path row TypedDicts (L3a)
# ---------------------------------------------------------------------------

class BookListRow(TypedDict):
    """Single row from the `_BOOK_SELECT` JOIN block. Returned by
    `dal.books.get_books` (list) and `get_book_by_id` (single row).

    Columns 1:1 with the SELECT; GROUP_CONCAT aggregates arrive as
    comma-separated strings (authors, tags) or comma-separated ids
    (author_ids, tag_ids). Deterministic ordering per E5.
    """
    id: int
    title: str
    sort_title: str | None
    description: str | None
    language: str | None
    publisher: str | None
    pub_date: str | None
    series_id: int | None
    series_number: float | None
    cover_path: str | None
    added_at: str
    updated_at: str
    series_name: str | None
    authors: str | None
    author_ids: str | None
    tags: str | None
    tag_ids: str | None
    rating: int | None
    is_read: int | None


class BookFileRow(TypedDict):
    id: int
    format: str
    file_path: str
    file_size: int


class BookIdentifierRow(TypedDict):
    type: str
    value: str


class DuplicateHit(TypedDict):
    """Row shape from `find_duplicates_by_title` — subset of book columns
    used for upload dedup."""
    id: int
    title: str
    authors: str | None


class BookListPage(TypedDict):
    """Paginated response shape from `dal.books.get_books`."""
    books: list[BookListRow]
    hasMore: bool
