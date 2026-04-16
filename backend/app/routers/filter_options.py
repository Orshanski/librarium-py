import sqlite3
from fastapi import APIRouter, Depends
from ..auth import get_current_user
from ..database import db_session
from ..dal.authors import list_author_options
from ..dal.tags import list_tag_options
from ..dal.series import list_series_options
from ..dal.filters import list_language_options
from .params import parse_ids

router = APIRouter(prefix="/api/filter-options", tags=["filter-options"])


def _build_filters(user: dict, authorIds: str = "", tagIds: str = "", seriesIds: str = "", language: str = "") -> dict:
    filters: dict = {"userId": user["userId"]}
    if ids := parse_ids(authorIds):
        filters["authorIds"] = ids
    if ids := parse_ids(tagIds):
        filters["tagIds"] = ids
    if ids := parse_ids(seriesIds):
        filters["seriesIds"] = ids
    if language:
        filters["language"] = language
    return filters


@router.get("/authors")
def author_options(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), tagIds: str = "", seriesIds: str = "", language: str = ""):
    return {"authors": list_author_options(db, _build_filters(user, tagIds=tagIds, seriesIds=seriesIds, language=language))}


@router.get("/tags")
def tag_options(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), authorIds: str = "", seriesIds: str = "", language: str = ""):
    return {"tags": list_tag_options(db, _build_filters(user, authorIds=authorIds, seriesIds=seriesIds, language=language))}


@router.get("/series")
def series_options(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), authorIds: str = "", tagIds: str = "", language: str = ""):
    return {"series": list_series_options(db, _build_filters(user, authorIds=authorIds, tagIds=tagIds, language=language))}


@router.get("/languages")
def language_options(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), authorIds: str = "", tagIds: str = "", seriesIds: str = ""):
    return {"languages": list_language_options(db, _build_filters(user, authorIds=authorIds, tagIds=tagIds, seriesIds=seriesIds))}
