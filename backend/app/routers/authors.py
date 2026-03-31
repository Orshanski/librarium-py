import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from ..auth import get_current_user, require_admin
from ..dal import authors as dal

log = logging.getLogger("librarium.authors")
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


class RenameBody(BaseModel):
    name: str


@router.put("/{author_id}")
def rename_author(author_id: int, body: RenameBody, request: Request):
    user = require_admin(request)
    dal.rename_author(author_id, body.name.strip())
    log.info("Renamed author=%d to=%s by user_id=%s", author_id, body.name.strip(), user["userId"])
    return {"ok": True}


class MergeBody(BaseModel):
    sourceId: int


@router.post("/{author_id}/merge")
def merge_author(author_id: int, body: MergeBody, request: Request):
    user = require_admin(request)
    if body.sourceId == author_id:
        return JSONResponse({"error": "Нельзя объединить с самим собой"}, status_code=400)
    dal.merge_authors(author_id, body.sourceId)
    log.info("Merged author source=%d into target=%d by user_id=%s",
             body.sourceId, author_id, user["userId"])
    return {"ok": True}


@router.delete("/{author_id}")
def delete_author(author_id: int, request: Request):
    user = require_admin(request)
    err = dal.delete_author(author_id)
    if err == "not_found":
        return JSONResponse({"error": "Автор не найден"}, status_code=404)
    if err == "has_books":
        return JSONResponse({"error": "Нельзя удалить автора с книгами"}, status_code=400)
    log.info("Deleted author=%d by user_id=%s", author_id, user["userId"])
    return {"ok": True}
