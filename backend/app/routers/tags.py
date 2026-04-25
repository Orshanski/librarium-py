from typing import Annotated
import logging
import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user, require_admin
from ..database import db_session
from ..dtos.catalog import UserSort
from ..dtos.entities import MapBody, TagCloudResponse, TagDetailResponse, TagMapResponse
from ..services import tags_service

log = logging.getLogger("librarium.tags")
router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("/cloud", response_model=TagCloudResponse)
def tag_cloud(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    top: int | None = None,
):
    return tags_service.tag_cloud(db, top)


@router.get("/{tag_id}", response_model=TagDetailResponse, response_model_exclude_none=True)  # exclude_none: optional fields are endpoint-specific extras (rating, is_read) absent for some query paths
def get_tag(
    tag_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    authorIds: Annotated[list[int] | None, Query()] = None,
    seriesIds: Annotated[list[int] | None, Query()] = None,
    language: Annotated[list[str] | None, Query()] = None,
    sort: UserSort = "addedDesc",
):
    return tags_service.get_tag(db, tag_id, user.user_id, authorIds, seriesIds, language, sort)


@router.put("/{tag_id}/map", response_model=TagMapResponse)
def map_tag(
    tag_id: int,
    body: MapBody,
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
):
    result = tags_service.map_tag(db, tag_id, body.name)
    action = "renamed" if result.renamed else "merged"
    log.info(
        "Tag %s: %d → %s (target=%d) by user_id=%s",
        action, tag_id, body.name, result.target_id, user.user_id,
    )
    return result
