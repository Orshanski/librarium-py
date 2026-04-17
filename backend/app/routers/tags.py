import logging
import sqlite3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user, require_admin
from ..database import db_session
from ..dal import tags as dal
from .params import parse_ids
from ._helpers import require_exists

log = logging.getLogger("librarium.tags")
router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("/cloud")
def tag_cloud(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), top: int | None = None):
    return {"tags": dal.get_tag_cloud(db, top)}


@router.get("/{tag_id}")
def get_tag(tag_id: int, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), authorIds: str = "", seriesIds: str = "", language: str = ""):
    result = dal.get_tag_by_id(db, tag_id, parse_ids(authorIds), parse_ids(seriesIds), language or None)
    require_exists(result)
    return result


class MapBody(BaseModel):
    name: str


@router.put("/{tag_id}/map")
def map_tag(tag_id: int, body: MapBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    require_exists(dal.tag_exists(db, tag_id))
    result = dal.map_tag(db, tag_id, name)
    action = "renamed" if result["renamed"] else "merged"
    log.info("Tag %s: %d → %s (target=%d) by user_id=%s",
             action, tag_id, name, result["target_id"], user["userId"])
    return {"ok": True, "targetId": result["target_id"]}
