"""Catalog query filter assembly.

Single source of truth for filter-dict used by book listings and options endpoints.
All callers pass already-normalized lists; query parsing stays in routers (parse_ids).
"""
import sqlite3

from ..dal.authors import list_author_options
from ..dal.filters import list_language_options
from ..dal.series import list_series_options
from ..dal.tags import list_tag_options


def build_catalog_filters(
    user: dict,
    *,
    author_ids: list[int] | None = None,
    tag_ids: list[int] | None = None,
    series_ids: list[int] | None = None,
    language: str | None = None,
) -> dict:
    """Assemble filter-dict scoped to the user.

    Router is responsible for parsing raw query strings to typed lists
    (see routers/params.py::parse_ids).
    """
    filters: dict = {"userId": user["userId"]}
    if author_ids:
        filters["authorIds"] = author_ids
    if tag_ids:
        filters["tagIds"] = tag_ids
    if series_ids:
        filters["seriesIds"] = series_ids
    if language:
        filters["language"] = language
    return filters


def get_author_options(db: sqlite3.Connection, filters: dict) -> dict:
    return {"authors": list_author_options(db, filters)}


def get_tag_options(db: sqlite3.Connection, filters: dict) -> dict:
    return {"tags": list_tag_options(db, filters)}


def get_series_options(db: sqlite3.Connection, filters: dict) -> dict:
    return {"series": list_series_options(db, filters)}


def get_language_options(db: sqlite3.Connection, filters: dict) -> dict:
    return {"languages": list_language_options(db, filters)}
