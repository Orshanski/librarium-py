import logging
import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user, require_admin
from ..database import db_session
from ..dtos.entities import MapBody, TagCloudResponse, TagDetailResponse, TagMapResponse
from ..services import tags_service
log = logging.getLogger("librarium.tags")
router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("/cloud", response_model=TagCloudResponse)
def tag_cloud(
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    top: int | None = None,
):
    return tags_service.tag_cloud(db, top)


@router.get("/{tag_id}", response_model=TagDetailResponse)
def get_tag(
    tag_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    authorIds: list[int] | None = Query(None),
    seriesIds: list[int] | None = Query(None),
    language: list[str] | None = Query(None),
):
    return tags_service.get_tag(db, tag_id, authorIds, seriesIds, language)


@router.put("/{tag_id}/map", response_model=TagMapResponse)
def map_tag(
    tag_id: int,
    body: MapBody,
    user: CurrentUser = Depends(require_admin),
    db: sqlite3.Connection = Depends(db_session),
):
    result = tags_service.map_tag(db, tag_id, body.name)
    action = "renamed" if result.renamed else "merged"
    log.info(
        "Tag %s: %d → %s (target=%d) by user_id=%s",
        action, tag_id, body.name, result.targetId, user.user_id,
    )
    return result
