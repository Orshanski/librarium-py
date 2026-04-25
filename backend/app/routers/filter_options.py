from typing import Annotated
import sqlite3
from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.entities import (
    AuthorOptionsResponse, LanguageOptionsResponse,
    SeriesOptionsResponse, TagOptionsResponse,
)
from ..services import filters_service

router = APIRouter(prefix="/api/filter-options", tags=["filter-options"])


@router.get("/authors", response_model=AuthorOptionsResponse)
def author_options(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    tag_ids: Annotated[list[int] | None, Query(alias="tagIds")] = None,
    series_ids: Annotated[list[int] | None, Query(alias="seriesIds")] = None,
    language: Annotated[list[str] | None, Query()] = None,
):
    filters = filters_service.build_catalog_filters(
        tag_ids=tag_ids,
        series_ids=series_ids,
        language=language,
    )
    return filters_service.list_author_options(db, user.user_id, filters)


@router.get("/tags", response_model=TagOptionsResponse)
def tag_options(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    author_ids: Annotated[list[int] | None, Query(alias="authorIds")] = None,
    series_ids: Annotated[list[int] | None, Query(alias="seriesIds")] = None,
    language: Annotated[list[str] | None, Query()] = None,
):
    filters = filters_service.build_catalog_filters(
        author_ids=author_ids,
        series_ids=series_ids,
        language=language,
    )
    return filters_service.list_tag_options(db, user.user_id, filters)


@router.get("/series", response_model=SeriesOptionsResponse)
def series_options(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    author_ids: Annotated[list[int] | None, Query(alias="authorIds")] = None,
    tag_ids: Annotated[list[int] | None, Query(alias="tagIds")] = None,
    language: Annotated[list[str] | None, Query()] = None,
):
    filters = filters_service.build_catalog_filters(
        author_ids=author_ids,
        tag_ids=tag_ids,
        language=language,
    )
    return filters_service.list_series_options(db, user.user_id, filters)


@router.get("/languages", response_model=LanguageOptionsResponse)
def language_options(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    author_ids: Annotated[list[int] | None, Query(alias="authorIds")] = None,
    tag_ids: Annotated[list[int] | None, Query(alias="tagIds")] = None,
    series_ids: Annotated[list[int] | None, Query(alias="seriesIds")] = None,
):
    filters = filters_service.build_catalog_filters(
        author_ids=author_ids,
        tag_ids=tag_ids,
        series_ids=series_ids,
    )
    return filters_service.list_language_options(db, user.user_id, filters)
