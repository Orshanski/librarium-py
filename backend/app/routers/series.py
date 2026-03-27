from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from ..auth import get_current_user
from ..dal import series as dal

router = APIRouter(prefix="/api/series", tags=["series"])


@router.get("")
def list_series(request: Request, authorIds: str = "", tagIds: str = "", language: str = ""):
    get_current_user(request)
    author_ids = [int(x) for x in authorIds.split(",") if x] if authorIds else None
    tag_ids = [int(x) for x in tagIds.split(",") if x] if tagIds else None
    return dal.get_series(author_ids, tag_ids, language or None)


@router.get("/{series_id}")
def get_series(series_id: int, request: Request):
    get_current_user(request)
    result = dal.get_series_by_id(series_id)
    if not result:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return result
