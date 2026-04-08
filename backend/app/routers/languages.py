from fastapi import APIRouter, Request
from ..auth import get_current_user
from ..dal.filters import list_language_options

router = APIRouter(tags=["languages"])


@router.get("/api/languages")
def list_languages(request: Request):
    get_current_user(request)
    return {"languages": list_language_options({})}
