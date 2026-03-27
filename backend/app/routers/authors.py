from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from ..auth import get_current_user
from ..dal import authors as dal

router = APIRouter(prefix="/api/authors", tags=["authors"])


@router.get("")
def list_authors(request: Request, tagIds: str = "", language: str = ""):
    get_current_user(request)
    tag_ids = [int(x) for x in tagIds.split(",") if x.strip().isdigit()] if tagIds else None
    return dal.get_authors(tag_ids, language or None)


@router.get("/{author_id}")
def get_author(author_id: int, request: Request):
    get_current_user(request)
    result = dal.get_author_by_id(author_id)
    if not result:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return result
