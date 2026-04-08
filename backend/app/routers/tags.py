import logging
import sqlite3
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from ..auth import get_current_user, require_admin
from ..database import db_session
from ..dal import tags as dal
from .params import parse_ids

log = logging.getLogger("librarium.tags")
router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("/cloud")
def tag_cloud(request: Request, db: sqlite3.Connection = Depends(db_session), top: int | None = None):
    get_current_user(request)
    return {"tags": dal.get_tag_cloud(db, top)}


@router.get("/{tag_id}")
def get_tag(tag_id: int, request: Request, db: sqlite3.Connection = Depends(db_session), authorIds: str = "", seriesIds: str = "", language: str = ""):
    get_current_user(request)
    result = dal.get_tag_by_id(db, tag_id, parse_ids(authorIds), parse_ids(seriesIds), language or None)
    if not result:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return result


class MapBody(BaseModel):
    name: str


@router.put("/{tag_id}/map")
def map_tag(tag_id: int, body: MapBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = require_admin(request)
    name = body.name.strip()
    if not name:
        return JSONResponse({"error": "Name required"}, status_code=400)
    if not dal.tag_exists(db, tag_id):
        return JSONResponse({"error": "Not found"}, status_code=404)
    result = dal.map_tag(db, tag_id, name)
    action = "renamed" if result["renamed"] else "merged"
    log.info("Tag %s: %d → %s (target=%d) by user_id=%s",
             action, tag_id, name, result["target_id"], user["userId"])
    return {"ok": True, "targetId": result["target_id"]}
