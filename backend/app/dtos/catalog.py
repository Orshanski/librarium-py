"""Catalog filter spec — shared by filter_options endpoints and book listing."""
from typing import Literal, NotRequired, TypedDict

UserSort = Literal[
    "addedDesc", "addedAsc",
    "titleAsc", "titleDesc",
    "authorAsc", "authorDesc",
    "ratingDesc", "ratingAsc",
]


class CatalogFilters(TypedDict, total=False):
    """Dimension filters for book-listing queries.

    Содержит только то, что пользователь выбрал в UI (authors/tags/series/language).
    user_id (scope context) передаётся отдельным параметром в DAL/сервисы,
    а не как поле этой структуры — см. bd librarium-py-bv0e.

    Ключи опускаются целиком, когда соответствующий фильтр не запрошен;
    они никогда не устанавливаются в пустой список или None.
    """

    authorIds: NotRequired[list[int]]
    tagIds: NotRequired[list[int]]
    seriesIds: NotRequired[list[int]]
    language: NotRequired[list[str]]


class LanguageOptionRow(TypedDict):
    """Row from `dal.filters.list_language_options` — single `name` column
    aliased from `b.language`."""
    name: str
