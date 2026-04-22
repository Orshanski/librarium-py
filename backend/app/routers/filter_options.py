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
    tagIds: list[int] | None = Query(None),
    seriesIds: list[int] | None = Query(None),
    language: list[str] | None = Query(None),
):
    filters = filters_service.build_catalog_filters(
        user.user_id,
        tag_ids=tagIds,
        series_ids=seriesIds,
        language=language,
    )
    return filters_service.list_author_options(db, filters)


@router.get("/tags", response_model=TagOptionsResponse)
def tag_options(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    authorIds: list[int] | None = Query(None),
    seriesIds: list[int] | None = Query(None),
    language: list[str] | None = Query(None),
):
    filters = filters_service.build_catalog_filters(
        user.user_id,
        author_ids=authorIds,
        series_ids=seriesIds,
        language=language,
    )
    return filters_service.list_tag_options(db, filters)


@router.get("/series", response_model=SeriesOptionsResponse)
def series_options(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    authorIds: list[int] | None = Query(None),
    tagIds: list[int] | None = Query(None),
    language: list[str] | None = Query(None),
):
    filters = filters_service.build_catalog_filters(
        user.user_id,
        author_ids=authorIds,
        tag_ids=tagIds,
        language=language,
    )
    return filters_service.list_series_options(db, filters)


@router.get("/languages", response_model=LanguageOptionsResponse)
def language_options(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    authorIds: list[int] | None = Query(None),
    tagIds: list[int] | None = Query(None),
    seriesIds: list[int] | None = Query(None),
):
    filters = filters_service.build_catalog_filters(
        user.user_id,
        author_ids=authorIds,
        tag_ids=tagIds,
        series_ids=seriesIds,
    )
    return filters_service.list_language_options(db, filters)
