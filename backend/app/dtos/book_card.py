"""Unified DTO for book-in-list across all endpoints.

Single Pydantic class returned by catalog, author detail, series detail, tag
detail, shelf detail, and search endpoints. Replaces BookListItem,
EntityBookItem, TagDetailBookItem, BookItem (shelf-list), SearchBookHit.

Snake-case Python fields; camelCase wire via RESPONSE_CONFIG alias_generator.
Accepts snake keys from DAL TypedDicts (populate_by_name=True).
"""
from pydantic import BaseModel

from ._aliases import RESPONSE_CONFIG
from ._refs import AuthorRef, SeriesRef


class BookCardItem(BaseModel):
    """Минимально достаточный набор полей для рендеринга карточки книги
    в любом списке. Контракт един по форме — все list-эндпоинты возвращают
    одну и ту же структуру.
    """
    model_config = RESPONSE_CONFIG

    id: int
    title: str
    authors: list[AuthorRef]
    series: SeriesRef | None
    series_number: float | None
    cover_path: str
    rating: int | None
    is_read: bool
