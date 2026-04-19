"""User-books request DTOs."""
from typing import TypedDict

from pydantic import BaseModel, Field


class RatingBody(BaseModel):
    rating: int | None = Field(None, ge=1, le=5)


class ReadBody(BaseModel):
    isRead: bool


class HiddenBody(BaseModel):
    isHidden: bool


# ---------------------------------------------------------------------------
# Read-path TypedDicts — one per distinct SELECT shape (R-A).
# ---------------------------------------------------------------------------


class UserBookRow(TypedDict):
    """Row from dal.user_books.get_user_book — SELECT * FROM user_books.
    Columns: user_id, book_id, is_read, is_hidden, rating (all nullable
    except PKs, stored as SQLite integers)."""
    user_id: int
    book_id: int
    is_read: int | None
    is_hidden: int | None
    rating: int | None
