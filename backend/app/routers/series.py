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
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    authorIds: list[int] | None = Query(None),
    tagIds: list[int] | None = Query(None),
    language: list[str] | None = Query(None),
):
    return series_service.list_series(
        db,
        user_id=user.user_id,
        author_ids=authorIds,
        tag_ids=tagIds,
        language=language,
    )


register_entity_crud(
    router,
    service=series_service,
    logger=log,
    entity_label="series",
    detail_response_model=SeriesDetailResponse,
)
