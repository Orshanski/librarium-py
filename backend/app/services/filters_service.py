"""Catalog query filter assembly.

Single source of truth for `CatalogFilters` used by book listings and options endpoints.
All callers pass already-normalized lists; query parsing stays in routers (parse_ids).
"""
import sqlite3

from ..dal import authors as _authors_dal
from ..dal import filters as _filters_dal
from ..dal import series as _series_dal
from ..dal import tags as _tags_dal
from ..dtos.catalog import CatalogFilters, LanguageOptionRow


def build_catalog_filters(
    user_id: int,
    *,
    author_ids: list[int] | None = None,
    tag_ids: list[int] | None = None,
    series_ids: list[int] | None = None,
    language: str | None = None,
) -> CatalogFilters:
    """Assemble `CatalogFilters` scoped to the user.

    Router is responsible for parsing raw query strings to typed lists
    (see routers/params.py::parse_ids).
    """
    filters: CatalogFilters = {"userId": user_id}
    if author_ids:
        filters["authorIds"] = author_ids
    if tag_ids:
        filters["tagIds"] = tag_ids
    if series_ids:
        filters["seriesIds"] = series_ids
    if language:
        filters["language"] = language
    return filters


def list_author_options(db: sqlite3.Connection, filters: CatalogFilters) -> list[dict]:
    return _authors_dal.list_author_options(db, filters)


def list_tag_options(db: sqlite3.Connection, filters: CatalogFilters) -> list[dict]:
    return _tags_dal.list_tag_options(db, filters)


def list_series_options(db: sqlite3.Connection, filters: CatalogFilters) -> list[dict]:
    return _series_dal.list_series_options(db, filters)


def list_language_options(db: sqlite3.Connection, filters: CatalogFilters) -> list[LanguageOptionRow]:
    return _filters_dal.list_language_options(db, filters)
