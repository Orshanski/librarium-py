from fastapi import APIRouter, Request
from ..auth import get_current_user
from ..dal.authors import list_author_options
from ..dal.tags import list_tag_options
from ..dal.series import list_series_options
from ..dal.filters import list_language_options
from .params import parse_ids

router = APIRouter(prefix="/api/filter-options", tags=["filter-options"])


def _build_filters(request: Request, authorIds: str = "", tagIds: str = "", seriesIds: str = "", language: str = "") -> dict:
    user = get_current_user(request)
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
def author_options(request: Request, tagIds: str = "", seriesIds: str = "", language: str = ""):
    return {"authors": list_author_options(_build_filters(request, tagIds=tagIds, seriesIds=seriesIds, language=language))}


@router.get("/tags")
def tag_options(request: Request, authorIds: str = "", seriesIds: str = "", language: str = ""):
    return {"tags": list_tag_options(_build_filters(request, authorIds=authorIds, seriesIds=seriesIds, language=language))}


@router.get("/series")
def series_options(request: Request, authorIds: str = "", tagIds: str = "", language: str = ""):
    return {"series": list_series_options(_build_filters(request, authorIds=authorIds, tagIds=tagIds, language=language))}


@router.get("/languages")
def language_options(request: Request, authorIds: str = "", tagIds: str = "", seriesIds: str = ""):
    return {"languages": list_language_options(_build_filters(request, authorIds=authorIds, tagIds=tagIds, seriesIds=seriesIds))}
