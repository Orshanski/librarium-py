"""Book request DTOs, write-input TypedDicts, and Response DTOs."""
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


class BookDetailResponse(BaseModel):
    """Response for GET /api/books/{book_id}.

    Wire format: {"book": {...}, "files": [...], "identifiers": [...]}
    All nested items are TypedDicts; Pydantic v2 validates TypedDict items
    natively. snake_case keys are preserved end-to-end (matching pre-L4 wire).
    """
    book: BookListRow
    files: list[BookFileRow]
    identifiers: list[BookIdentifierRow]


class BookListResponse(BaseModel):
    """Response for GET /api/books (paginated catalog).

    Wire format: {"books": [...], "hasMore": bool}
    Same as BookListPage TypedDict but as Pydantic for response_model.
    """
    books: list[BookListRow]
    hasMore: bool


class UploadFileResponse(BaseModel):
    """Response for POST /api/books/{book_id}/files."""
    ok: bool = True
    format: str
    size: int


class BookFormatItem(BaseModel):
    """Формат книги (файл) — элемент `BookItem.formats`. Заготовка
    на будущее (BookDetail endpoint): в jmdc для shelves/tags не
    заполняется."""
    format: str
    size: int


class BookItem(BaseModel):
    """Pydantic response DTO для книги (camelCase wire). Используется в
    ShelfDetailResponse и TagDetailResponse. Собирается в service-слое через
    services.book_item_builder.row_to_book_item().

    Поля, отсутствующие в конкретном endpoint (rating/isRead только в best;
    fraction/lastFormat/lastReadAt только в reading_now), остаются None и
    вырезаются через response_model_exclude_none=True на router-уровне.
    """
    # Core — всегда присутствуют
    id: int
    title: str
    coverPath: str                      # composed: /api/covers/{id}?t={updated_at}
    authors: list[str]
    authorIds: list[int]
    tags: list[str]
    tagIds: list[int]
    addedAt: str
    updatedAt: str

    # Optional — могут отсутствовать в конкретных полях SQL
    sortTitle: str | None = None
    description: str | None = None
    language: str | None = None
    publisher: str | None = None
    pubDate: str | None = None
    series: str | None = None
    seriesId: int | None = None
    seriesNumber: float | None = None

    # User-specific (JOIN user_books)
    rating: int | None = None
    isRead: bool | None = None

    # Reading progress (только reading_now)
    fraction: float | None = None
    lastFormat: str | None = None
    lastReadAt: str | None = None

    # BookDetail-only (в jmdc не заполняется, на будущее)
    formats: list[BookFormatItem] | None = None
    isbn: str | None = None
