import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from ..auth import get_current_user, require_admin
from ..dal import tags as dal
from .params import parse_ids

log = logging.getLogger("librarium.tags")
router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("/cloud")
def tag_cloud(request: Request, top: int | None = None):
    get_current_user(request)
    return {"tags": dal.get_tag_cloud(top)}


@router.get("/{tag_id}")
def get_tag(tag_id: int, request: Request, authorIds: str = "", seriesIds: str = "", language: str = ""):
    get_current_user(request)
    result = dal.get_tag_by_id(tag_id, parse_ids(authorIds), parse_ids(seriesIds), language or None)
    if not result:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return result


class MapBody(BaseModel):
    name: str


@router.put("/{tag_id}/map")
def map_tag(tag_id: int, body: MapBody, request: Request):
    user = require_admin(request)
    name = body.name.strip()
    if not name:
        return JSONResponse({"error": "Name required"}, status_code=400)
    from ..database import get_db
    db = get_db()
    tag = db.execute("SELECT id FROM tags WHERE id = :id", {"id": tag_id}).fetchone()
    if not tag:
        return JSONResponse({"error": "Not found"}, status_code=404)
    result = dal.map_tag(tag_id, name)
    action = "renamed" if result["renamed"] else "merged"
    log.info("Tag %s: %d → %s (target=%d) by user_id=%s",
             action, tag_id, name, result["target_id"], user["userId"])
    return {"ok": True, "targetId": result["target_id"]}
