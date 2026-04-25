"""Shelves request DTOs and Response DTOs."""
from typing import NotRequired, TypedDict

from pydantic import BaseModel, ConfigDict

from ._aliases import to_camel
from ._refs import AuthorRef, SeriesRef, TagRef
from .books import BookItem, RESPONSE_CONFIG

_BODY_CONFIG = ConfigDict(populate_by_name=False, alias_generator=to_camel, extra="forbid")


class ShelfSummary(BaseModel):
    """Заголовок полки на wire в camelCase — поле shelf в ответе /api/shelves/{id}."""
    id: int
    name: str
    isSystem: bool
    systemCode: str | None = None


class ShelfBody(BaseModel):
    model_config = _BODY_CONFIG
    name: str


class ShelfBookBody(BaseModel):
    model_config = _BODY_CONFIG
    book_id: int


# ---------------------------------------------------------------------------
# Read-path TypedDicts — one per distinct SELECT shape (R-A).
# ---------------------------------------------------------------------------


class ShelfBaseRow(TypedDict):
    """Raw `SELECT * FROM shelves` row — used by dal.shelves.get_shelf_by_id.

    No `book_count` column — that aggregate is added only in the list path
    (`get_shelves`) via a separate count query, not via this SELECT. R-A:
    distinct shape from `ShelfRow`."""
    id: int
    name: str
    user_id: int
    is_system: int
    system_code: str | None
    created_at: str


class ShelfRow(TypedDict):
    """Row from dal.shelves.get_shelves — base shelves columns plus the
    `book_count` aggregate (real SQL COUNT for user shelves, separate
    COUNT queries for system shelves).

    `is_system` is an int (SQLite BOOLEAN stored as 0/1). R-A: distinct
    from `ShelfBaseRow` because `book_count` is always present here."""
    id: int
    name: str
    user_id: int
    is_system: int
    system_code: str | None
    created_at: str
    book_count: int


class ShelfBookRow(TypedDict):
    """Book row inside dal.shelves.get_shelf_by_id books list.

    All three shelf branches (best, reading_now, regular) share explicit
    column set — no b.*, no flat series_name/series_id/author_ids/tag_ids.
    Authors and tags are parsed JSON arrays (list[AuthorRef] / list[TagRef]).
    Series is a parsed JSON object (SeriesRef) or None.

    User-state columns rating и is_read селектируются всеми тремя ветками
    через LEFT JOIN user_books — ключи всегда присутствуют, значение None при
    отсутствии user_books-ряда. NotRequired остаётся только у reading_now-only
    полей: fraction, last_format, last_read_at.

    R-A: одна TypedDict с NotRequired-extras для reading_now — single return
    site (ShelfDetailRow.books); callers получают все варианты одинаковой формы."""
    id: int
    title: str
    sort_title: str | None
    description: str | None
    language: str | None
    publisher: str | None
    pub_date: str | None
    series_number: float | None
    cover_path: str | None
    added_at: str
    updated_at: str
    series: SeriesRef | None
    authors: list[AuthorRef]
    tags: list[TagRef]
    rating: int | None
    is_read: int | None
    # reading_now-only
    fraction: NotRequired[float | None]
    last_format: NotRequired[str | None]
    last_read_at: NotRequired[str | None]


class ShelfDetailRow(TypedDict):
    """Return shape of dal.shelves.get_shelf_by_id — envelope containing
    the shelf metadata row (without aggregate `book_count`) and its book
    rows. Uses ShelfBaseRow, not ShelfRow (R-A)."""
    shelf: ShelfBaseRow
    books: list[ShelfBookRow]


class BookShelfEntry(TypedDict):
    """Per-shelf entry built in shelves_service.list_shelves when book_id is
    provided — {id, has_book} flag indicating whether the book is on the shelf.
    Constructed in service layer from dal.get_shelves + dal.get_book_shelf_ids;
    not returned directly from DAL."""
    id: int
    has_book: bool


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only. R-B: never
# imported from DAL; construction in service layer.
# ---------------------------------------------------------------------------


class ShelvesListResponse(BaseModel):
    """Response for GET /api/shelves.

    Wire format (camelCase):
      without bookId: {"shelves": [...]}
      with bookId:    {"shelves": [...], "bookShelves": [...]}

    `book_shelves` is None when book_id is absent; omitted from wire via
    response_model_exclude_none=True on the endpoint.
    """
    model_config = RESPONSE_CONFIG

    shelves: list[ShelfRow]
    book_shelves: list[BookShelfEntry] | None = None


class ShelfDetailResponse(BaseModel):
    """Response for GET /api/shelves/{shelf_id}.

    Wire format (camelCase): {"shelf": {...}, "books": [...]}
    """
    model_config = RESPONSE_CONFIG

    shelf: ShelfSummary
    books: list[BookItem]
