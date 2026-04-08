from fastapi import APIRouter, Request
from ..auth import get_current_user
from ..dal.filters import list_language_options
from .params import parse_ids

router = APIRouter(tags=["languages"])


@router.get("/api/languages")
def list_languages(request: Request, authorIds: str = "", tagIds: str = "", seriesIds: str = "", language: str = ""):
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
    return {"languages": list_language_options(filters)}
