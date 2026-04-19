import sqlite3
from fastapi import APIRouter, Depends

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..services import filters_service
from .params import parse_ids

router = APIRouter(prefix="/api/filter-options", tags=["filter-options"])


@router.get("/authors")
def author_options(
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    tagIds: str = "",
    seriesIds: str = "",
    language: str = "",
):
    filters = filters_service.build_catalog_filters(
        user.user_id,
        tag_ids=parse_ids(tagIds),
        series_ids=parse_ids(seriesIds),
        language=language or None,
    )
    return {"authors": filters_service.list_author_options(db, filters)}


@router.get("/tags")
def tag_options(
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    authorIds: str = "",
    seriesIds: str = "",
    language: str = "",
):
    filters = filters_service.build_catalog_filters(
        user.user_id,
        author_ids=parse_ids(authorIds),
        series_ids=parse_ids(seriesIds),
        language=language or None,
    )
    return {"tags": filters_service.list_tag_options(db, filters)}


@router.get("/series")
def series_options(
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    authorIds: str = "",
    tagIds: str = "",
    language: str = "",
):
    filters = filters_service.build_catalog_filters(
        user.user_id,
        author_ids=parse_ids(authorIds),
        tag_ids=parse_ids(tagIds),
        language=language or None,
    )
    return {"series": filters_service.list_series_options(db, filters)}


@router.get("/languages")
def language_options(
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    authorIds: str = "",
    tagIds: str = "",
    seriesIds: str = "",
):
    filters = filters_service.build_catalog_filters(
        user.user_id,
        author_ids=parse_ids(authorIds),
        tag_ids=parse_ids(tagIds),
        series_ids=parse_ids(seriesIds),
    )
    return {"languages": filters_service.list_language_options(db, filters)}
