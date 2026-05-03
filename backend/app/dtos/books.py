"""Book request DTOs, write-input TypedDicts, and Response DTOs."""
from typing import Annotated, NotRequired, TypedDict

from pydantic import BaseModel, Field

from ._aliases import BODY_CONFIG, RESPONSE_CONFIG
from ._refs import AuthorRef, TagRef, SeriesRef
from ._types import FormatCode, TempIdStr


class UpdateBookBody(BaseModel):
    model_config = BODY_CONFIG

    title: str | None = None
    description: str | None = None
    language: str | None = None
    publisher: str | None = None
    pub_date: str | None = None
    series_id: int | str | None = None
    series_number: float | None = None
    author_ids: list[int | str] | None = None
    tag_ids: list[int | str] | None = None
    isbn: str | None = None
    add_formats: Annotated[list[TempIdStr], Field(max_length=10)] | None = None
    delete_formats: Annotated[list[FormatCode], Field(max_length=10)] | None = None
    commit_cover: bool = False


class BookCreateData(TypedDict):
    """Write-data for `dal.books.create_book`. Built in upload_service from
    CreateBookMetadataIn + resolved author/series/tag IDs."""
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
    pub_date: str | None
    series_id: int | str | None
    series_number: float | None
    author_ids: list[int | str]
    tag_ids: list[int | str]
    isbn: str | None
    sort_title: str
    cover_path: str


# ---------------------------------------------------------------------------
# Read-path row TypedDicts (L3a)
# ---------------------------------------------------------------------------

class BookListRow(TypedDict):
    """Single row from `dal.books.get_books` (list) and `get_book_by_id` (single row).

    Authors/tags are returned as list[Ref] after parse_book_row_aggregates;
    series is SeriesRef or None. Columns author_ids/tag_ids/series_id/series_name
    are not in the row (id is already inside the ref objects).
    """
    id: int
    title: str
    sort_title: str | None
    description: str | None
    language: str | None
    publisher: str | None
    pub_date: str | None
    series: SeriesRef | None
    series_number: float | None
    cover_path: str | None
    added_at: str
    updated_at: str
    authors: list[AuthorRef]
    tags: list[TagRef]
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
    """Строка из `find_duplicates_by_title` — субмножество колонок книги для upload-dedup UI."""
    id: int
    title: str
    authors: list[AuthorRef]


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only. R-B: never
# used as DAL row type; construction happens in service layer only.
# ---------------------------------------------------------------------------


class BookListItem(BaseModel):
    """Single book item in list/detail responses. Snake-case Python fields;
    serialises to camelCase wire via alias_generator. Accepts snake keys from
    DAL TypedDicts (populate_by_name=True) and camel keys from wire."""
    model_config = RESPONSE_CONFIG

    id: int
    title: str
    sort_title: str | None = None
    description: str | None = None
    language: str | None = None
    publisher: str | None = None
    pub_date: str | None = None
    series: SeriesRef | None = None
    series_number: float | None = None
    cover_path: str | None = None
    added_at: str
    updated_at: str
    authors: list[AuthorRef]
    tags: list[TagRef]
    rating: int | None = None
    is_read: int | None = None


class BookFileItem(BaseModel):
    """Book file (format) item in detail response."""
    model_config = RESPONSE_CONFIG

    id: int
    format: str
    file_size: int | None = None


class BookIdentifierItem(BaseModel):
    """Book identifier (e.g. ISBN) in detail response."""
    model_config = RESPONSE_CONFIG

    type: str
    value: str


class DuplicateHitItem(BaseModel):
    """Duplicate candidate item in upload-dedup response."""
    model_config = RESPONSE_CONFIG

    id: int
    title: str
    authors: list[AuthorRef]


class BookDetailResponse(BaseModel):
    """Response for GET /api/books/{book_id}.

    Wire format (camelCase): {"book": {...}, "files": [...], "identifiers": [...]}
    Pydantic validates DAL TypedDict rows (snake keys) into BookListItem/
    BookFileItem/BookIdentifierItem via populate_by_name=True on each item.
    """
    model_config = RESPONSE_CONFIG

    book: BookListItem
    files: list[BookFileItem]
    identifiers: list[BookIdentifierItem]


class UpdateBookResponse(BookDetailResponse):
    """Response for PUT /api/books/{book_id}: success marker plus fresh detail."""
    ok: bool = True


class BookListResponse(BaseModel):
    """Response for GET /api/books (paginated catalog).

    Wire format (camelCase): {"books": [...], "hasMore": bool}
    `books` contains at most `page_size` rows; `hasMore` signals that more
    rows exist beyond the current cursor.
    """
    model_config = RESPONSE_CONFIG

    books: list[BookListItem]
    has_more: bool


class BookFormatItem(BaseModel):
    """Формат книги (файл) — элемент `BookItem.formats`. Snake-поля, camel-wire
    через alias_generator. Заготовка на будущее (BookDetail endpoint): в jmdc
    для shelves/tags не заполняется."""
    model_config = RESPONSE_CONFIG

    format: str
    size: int


class BookItem(BaseModel):
    """Pydantic response DTO для книги в составе ShelfDetailResponse.

    Единственный потребитель — ShelfDetailResponse (shelves.py).
    Собирается через services.book_item_builder.row_to_book_item().

    Snake-поля Python, camelCase wire через alias_generator=to_camel.

    Опциональные поля endpoint-специфичны:
    - rating / is_read — только для полки «лучшее»;
    - fraction / last_format / last_read_at — только для «читаю сейчас».
    Отсутствующие поля остаются None и вырезаются через
    response_model_exclude_none=True на уровне роутера.

    formats / isbn — всегда None, зарезервированы для будущего
    BookDetail-via-shelves сценария.
    """
    model_config = RESPONSE_CONFIG

    # Core — всегда присутствуют
    id: int
    title: str
    cover_path: str
    authors: list[AuthorRef]
    tags: list[TagRef]
    added_at: str
    updated_at: str

    # Optional — могут отсутствовать в конкретных полях SQL
    sort_title: str | None = None
    description: str | None = None
    language: str | None = None
    publisher: str | None = None
    pub_date: str | None = None
    series: SeriesRef | None = None
    series_number: float | None = None

    # User-specific (JOIN user_books)
    rating: int | None = None
    is_read: bool | None = None

    # Reading progress (только reading_now)
    fraction: float | None = None
    last_format: str | None = None
    last_read_at: str | None = None

    # BookDetail-only (в jmdc не заполняется, на будущее)
    formats: list[BookFormatItem] | None = None
    isbn: str | None = None
