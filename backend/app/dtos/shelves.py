"""Shelves request DTOs."""
from typing import NotRequired, TypedDict

from pydantic import BaseModel


class ShelfBody(BaseModel):
    name: str


class ShelfBookBody(BaseModel):
    bookId: int


# ---------------------------------------------------------------------------
# Read-path TypedDicts — one per distinct SELECT shape (R-A).
# ---------------------------------------------------------------------------


class ShelfRow(TypedDict):
    """Row from dal.shelves.get_shelves.
    Columns: SELECT sh.* (all shelves columns) + COUNT(...) as book_count.
    book_count is always present in the query result; is_system is an int
    (SQLite BOOLEAN stored as 0/1)."""
    id: int
    name: str
    user_id: int
    is_system: int
    system_code: str | None
    created_at: str
    book_count: int


class ShelfBookRow(TypedDict):
    """Book row inside dal.shelves.get_shelf_by_id books list.
    Base columns come from BOOK_LIST_AGGREGATE_COLUMNS (b.*, series_name,
    authors aggregate, tags aggregate).  Extra columns depend on system_code
    branch and are NotRequired because they are absent for regular shelves:
    - rating    present for system_code='best' branch
    - fraction, last_format, last_read_at  present for system_code='reading_now'
    All three are absent for regular (non-system) shelves.
    R-A: one TypedDict with NotRequired extras is correct here — the function
    has one return site (ShelfDetailRow.books), callers receive all variants."""
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
    tags: str | None
    # system shelf extras
    rating: NotRequired[int | None]
    fraction: NotRequired[float | None]
    last_format: NotRequired[str | None]
    last_read_at: NotRequired[str | None]


class ShelfDetailRow(TypedDict):
    """Return shape of dal.shelves.get_shelf_by_id — envelope containing
    the shelf metadata row and its book rows."""
    shelf: ShelfRow
    books: list[ShelfBookRow]


class BookShelfEntry(TypedDict):
    """Per-shelf entry built in shelves_service.list_shelves when book_id is
    provided — {id, has_book} flag indicating whether the book is on the shelf.
    Constructed in service layer from dal.get_shelves + dal.get_book_shelf_ids;
    not returned directly from DAL."""
    id: int
    has_book: bool
