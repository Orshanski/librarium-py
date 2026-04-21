"""Catalog filter spec — shared by filter_options endpoints and book listing."""
from typing import Literal, NotRequired, TypedDict

UserSort = Literal[
    "addedDesc", "addedAsc",
    "titleAsc", "titleDesc",
    "authorAsc", "authorDesc",
    "ratingDesc", "ratingAsc",
]


class CatalogFilters(TypedDict):
    """Filter parameters for book-listing queries.

    Constructed in ``filters_service.build_catalog_filters``; consumed by
    ``dal.books.get_books``, ``dal.filters.build_book_where``, and the
    four ``list_*_options`` DAL functions. ``userId`` is always present
    (user scoping is universal); the other keys are omitted entirely when the
    corresponding filter is not requested — they are never set to empty list or None.
    """

    userId: int
    authorIds: NotRequired[list[int]]
    tagIds: NotRequired[list[int]]
    seriesIds: NotRequired[list[int]]
    language: NotRequired[list[str]]


class LanguageOptionRow(TypedDict):
    """Row from `dal.filters.list_language_options` — single `name` column
    aliased from `b.language`."""
    name: str
