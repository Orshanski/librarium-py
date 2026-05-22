from typing import Annotated
import logging
import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.catalog import UserSort
from ..dtos.entities import TagCloudResponse, TagDetailResponse
from ..services import tags_service
from ._entity_crud import register_entity_crud

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


# Three new endpoints via factory: PUT /{tag_id} rename, POST /{tag_id}/merge,
# DELETE /{tag_id}. GET /{tag_id} остаётся custom (см. выше) — фильтры
# несовместимы с factory-handler'ом. register_get=False.
register_entity_crud(
    router,
    service=tags_service,
    logger=log,
    entity_label="tag",
    register_get=False,
)
