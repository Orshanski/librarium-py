import logging
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos import OkResponse
from ..dtos.recap import RecapDocument
from ..events import EventScope, publish_domain_event_after_commit
from ..exceptions import NotFoundError
from ..services import recap_service

router = APIRouter(tags=["recap"])
log = logging.getLogger("librarium.recap")


@router.put("/api/books/{book_id}/recap", response_model=OkResponse)
def upload_recap(
    book_id: int,
    body: RecapDocument,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
) -> OkResponse:
    recap_service.save_recap(db, book_id, body.model_dump(by_alias=True))
    log.info("recap uploaded book_id=%s user_id=%s", int(book_id), str(user.user_id))
    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="library"),
        event_type="bookUpdated",
        payload={"book": {"id": int(book_id)}, "changedFields": ["recap"]},
    )
    return OkResponse()


@router.get("/api/books/{book_id}/recap")
def get_recap(
    book_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
):
    if not recap_service.has_recap(book_id):
        raise NotFoundError("Рекап не найден")
    return FileResponse(
        recap_service.recap_path(book_id),
        media_type="application/json",
        headers={"Cache-Control": "private, max-age=3600"},
    )
