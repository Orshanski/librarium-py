from fastapi import APIRouter, Request
from ..auth import get_current_user
from ..dal.filters import get_filter_options

router = APIRouter(tags=["languages"])


@router.get("/api/languages")
def list_languages(request: Request):
    get_current_user(request)
    return {"languages": get_filter_options({}, "language")}
