import logging
import sqlite3

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.entities import AuthorDetailResponse, AuthorsListResponse
from ..services import authors_service
from .params import parse_ids
from ._entity_crud import register_entity_crud

log = logging.getLogger("librarium.authors")
router = APIRouter(prefix="/api/authors", tags=["authors"])


@router.get("", response_model=AuthorsListResponse)
def list_authors(
    user: CurrentUser = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
    tagIds: str = "",
    language: str = "",
):
    return authors_service.list_authors(
        db,
        user_id=user.user_id,
        tag_ids=parse_ids(tagIds),
        language=language or None,
    )


register_entity_crud(
    router,
    service=authors_service,
    logger=log,
    entity_label="author",
    detail_response_model=AuthorDetailResponse,
)
