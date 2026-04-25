from typing import Annotated
import logging
import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.entities import SeriesDetailResponse, SeriesListResponse
from ..services import series_service
from ._entity_crud import register_entity_crud

log = logging.getLogger("librarium.series")
router = APIRouter(prefix="/api/series", tags=["series"])


@router.get("", response_model=SeriesListResponse)
def list_series(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    author_ids: Annotated[list[int] | None, Query(alias="authorIds")] = None,
    tag_ids: Annotated[list[int] | None, Query(alias="tagIds")] = None,
    language: Annotated[list[str] | None, Query()] = None,
):
    return series_service.list_series(
        db,
        user_id=user.user_id,
        author_ids=author_ids,
        tag_ids=tag_ids,
        language=language,
    )


register_entity_crud(
    router,
    service=series_service,
    logger=log,
    entity_label="series",
    detail_response_model=SeriesDetailResponse,
)
