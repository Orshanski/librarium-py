import logging
import sqlite3

from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..database import db_session
from ..dal import series as dal
from ..services import series_service
from .params import parse_ids
from ._entity_crud import register_entity_crud

log = logging.getLogger("librarium.series")
router = APIRouter(prefix="/api/series", tags=["series"])


@router.get("")
def list_series(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    authorIds: str = "",
    tagIds: str = "",
    language: str = "",
):
    return dal.get_series(
        db,
        parse_ids(authorIds),
        parse_ids(tagIds),
        language or None,
        user_id=user["userId"],
    )


register_entity_crud(router, service=series_service, logger=log, entity_label="series")
