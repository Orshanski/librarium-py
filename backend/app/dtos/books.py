"""Book request DTOs, write-input TypedDicts, and Response DTOs."""
from typing import Any, NotRequired, TypedDict

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
    is_read: int | None  # SQLite BOOLEAN stored as 0/1; NULL via LEFT JOIN


class BookFileRow(TypedDict):
    id: int
    format: str
    file_path: str
    # file_size: schema allows NULL (INTEGER without NOT NULL); every
    # current insert site provides a value, but the type reflects the
    # column contract, not the insert invariant.
    file_size: int | None


class BookFileLookup(TypedDict):
    """Narrow lookup shape from `dal.books.get_book_file` — returns only
    `id` and `file_path`, not the full `BookFileRow` (R-A: distinct shape,
    distinct TypedDict)."""
    id: int
    file_path: str


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
    """Paginated response shape from `dal.books.get_books`.

    The `books` list is at most `page_size` long. `hasMore` is derived
    from a `page_size + 1` peek at the DAL level: if the underlying query
    returned one extra row, `hasMore=True` and the row is trimmed before
    return.
    """
    books: list[BookListRow]
    hasMore: bool


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only. R-B: never
# used as DAL row type; construction happens in service layer only.
# ---------------------------------------------------------------------------


class BookFileItem(BaseModel):
    """File entry in BookDetailResponse.files — preserves snake_case wire keys
    matching the pre-L4 BookFileRow dict passthrough."""
    id: int
    format: str
    file_path: str
    file_size: int | None = None


class BookIdentifierItem(BaseModel):
    """Identifier entry in BookDetailResponse.identifiers."""
    type: str
    value: str


class BookDetailResponse(BaseModel):
    """Response for GET /api/books/{book_id}.

    Wire format: {"book": {...}, "files": [...], "identifiers": [...]}
    The `book` field is the raw BookListRow dict (snake_case, preserving the
    pre-L4 passthrough). We accept Any here to avoid re-declaring all ~18
    BookListRow fields in a nested Pydantic model — the row arrives as a
    TypedDict/dict and is serialized as-is by FastAPI's JSON encoder.
    """
    model_config = {"arbitrary_types_allowed": True}

    book: Any
    files: list[BookFileItem]
    identifiers: list[BookIdentifierItem]


class BookListResponse(BaseModel):
    """Response for GET /api/books (paginated catalog).

    Wire format: {"books": [...], "hasMore": bool}
    Same as BookListPage TypedDict but as Pydantic for response_model.
    """
    books: list[Any]
    hasMore: bool


class UploadFileResponse(BaseModel):
    """Response for POST /api/books/{book_id}/files."""
    ok: bool = True
    format: str
    size: int
