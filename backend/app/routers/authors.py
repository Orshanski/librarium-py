from typing import Annotated
import logging
import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.entities import AuthorDetailResponse, AuthorsListResponse
from ..services import authors_service
from ._entity_crud import register_entity_crud

log = logging.getLogger("librarium.authors")
router = APIRouter(prefix="/api/authors", tags=["authors"])


@router.get("", response_model=AuthorsListResponse)
def list_authors(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    tagIds: Annotated[list[int] | None, Query()] = None,
    language: Annotated[list[str] | None, Query()] = None,
):
    return authors_service.list_authors(
        db,
        user_id=user.user_id,
        tag_ids=tagIds,
        language=language,
    )


register_entity_crud(
    router,
    service=authors_service,
    logger=log,
    entity_label="author",
    detail_response_model=AuthorDetailResponse,
)
