from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from ..auth import get_current_user
from ..dal import tags as dal

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("")
def list_tags(request: Request, top: int | None = None):
    get_current_user(request)
    return {"tags": dal.get_tags(top)}


@router.get("/{tag_id}")
def get_tag(tag_id: int, request: Request, authorIds: str = "", seriesIds: str = "", language: str = ""):
    get_current_user(request)
    author_ids = [int(x) for x in authorIds.split(",") if x.strip().isdigit()] if authorIds else None
    series_ids = [int(x) for x in seriesIds.split(",") if x.strip().isdigit()] if seriesIds else None
    result = dal.get_tag_by_id(tag_id, author_ids, series_ids, language or None)
    if not result:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return result
