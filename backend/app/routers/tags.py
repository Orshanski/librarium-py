import logging
import sqlite3

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from ..auth import get_current_user, require_admin
from ..database import db_session
from ..services import tags_service
from .params import parse_ids

log = logging.getLogger("librarium.tags")
router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("/cloud")
def tag_cloud(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    top: int | None = None,
):
    return tags_service.tag_cloud(db, top)


@router.get("/{tag_id}")
def get_tag(
    tag_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    authorIds: str = "",
    seriesIds: str = "",
    language: str = "",
):
    return tags_service.get_tag(
        db, tag_id, parse_ids(authorIds), parse_ids(seriesIds), language or None
    )


class MapBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(..., min_length=1)


@router.put("/{tag_id}/map")
def map_tag(
    tag_id: int,
    body: MapBody,
    user: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(db_session),
):
    result = tags_service.map_tag(db, tag_id, body.name)
    action = "renamed" if result["renamed"] else "merged"
    log.info(
        "Tag %s: %d → %s (target=%d) by user_id=%s",
        action, tag_id, body.name, result["target_id"], user["userId"],
    )
    return {"ok": True, "targetId": result["target_id"]}
