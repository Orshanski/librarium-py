from typing import Annotated
import logging
import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user, require_admin
from ..database import db_session
from ..dtos.catalog import UserSort
from ..dtos.entities import MapBody, TagCloudResponse, TagDetailResponse, TagMapResponse
from ..events import EventScope, publish_domain_event_after_commit
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


@router.get("/{tag_id}", response_model=TagDetailResponse)
def get_tag(
    tag_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    author_ids: Annotated[list[int] | None, Query(alias="authorIds")] = None,
    series_ids: Annotated[list[int] | None, Query(alias="seriesIds")] = None,
    language: Annotated[list[str] | None, Query()] = None,
    sort: UserSort = "addedDesc",
):
    return tags_service.get_tag(db, tag_id, user.user_id, author_ids, series_ids, language, sort)


@router.put("/{tag_id}/map", response_model=TagMapResponse)
def map_tag(
    tag_id: int,
    body: MapBody,
    user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
):
    result = tags_service.map_tag(db, tag_id, body.name)
    if result.changed:
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="library"),
            event_type="tagMapped",
            payload={"tagId": tag_id, "targetId": result.target_id, "name": result.name},
        )
    action = "renamed" if result.renamed else "merged"
    log.info(
        "Tag %s: %d → %s (target=%d) by user_id=%s",
        action, tag_id, body.name, result.target_id, user.user_id,
    )
    return result
