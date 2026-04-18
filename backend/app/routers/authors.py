import logging
import sqlite3

from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..database import db_session
from ..dal import authors as dal
from ..services import authors_service
from .params import parse_ids
from ._entity_crud import register_entity_crud

log = logging.getLogger("librarium.authors")
router = APIRouter(prefix="/api/authors", tags=["authors"])


@router.get("")
def list_authors(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    tagIds: str = "",
    language: str = "",
):
    return dal.get_authors(db, parse_ids(tagIds), language or None, user_id=user["userId"])


register_entity_crud(router, service=authors_service, logger=log, entity_label="author")
