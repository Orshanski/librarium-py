"""Catalog query filter assembly.

Single source of truth for `CatalogFilters` used by book listings and options endpoints.
All callers pass already-typed lists; FastAPI parses query directly into `list[T]`.
"""
import sqlite3

from ..dal import authors as _authors_dal
from ..dal import filters as _filters_dal
from ..dal import series as _series_dal
from ..dal import tags as _tags_dal
from ..dtos.catalog import CatalogFilters
from ..dtos.entities import (
    AuthorOptionsResponse, TagOptionsResponse,
    SeriesOptionsResponse, LanguageOptionsResponse,
)


def build_catalog_filters(
    *,
    author_ids: list[int] | None = None,
    tag_ids: list[int] | None = None,
    series_ids: list[int] | None = None,
    language: list[str] | None = None,
) -> CatalogFilters:
    """Assemble dimension filters from UI query parameters.

    user_id (scope) — отдельный параметр на уровне DAL.
    Router receives typed lists directly from FastAPI (`list[T] | None = Query(None)`)
    and passes them through without transformation.
    """
    filters: CatalogFilters = {}
    if author_ids:
        filters["authorIds"] = author_ids
    if tag_ids:
        filters["tagIds"] = tag_ids
    if series_ids:
        filters["seriesIds"] = series_ids
    if language:
        filters["language"] = language
    return filters


def list_author_options(db: sqlite3.Connection, user_id: int, filters: CatalogFilters) -> AuthorOptionsResponse:
    return AuthorOptionsResponse(authors=_authors_dal.list_author_options(db, user_id=user_id, filters=filters))


def list_tag_options(db: sqlite3.Connection, user_id: int, filters: CatalogFilters) -> TagOptionsResponse:
    return TagOptionsResponse(tags=_tags_dal.list_tag_options(db, user_id=user_id, filters=filters))


def list_series_options(db: sqlite3.Connection, user_id: int, filters: CatalogFilters) -> SeriesOptionsResponse:
    return SeriesOptionsResponse(series=_series_dal.list_series_options(db, user_id=user_id, filters=filters))


def list_language_options(db: sqlite3.Connection, user_id: int, filters: CatalogFilters) -> LanguageOptionsResponse:
    return LanguageOptionsResponse(languages=_filters_dal.list_language_options(db, user_id=user_id, filters=filters))
