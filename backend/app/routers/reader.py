from typing import Annotated
import sqlite3
from fastapi import APIRouter, Depends, Request, Response
from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos import OkResponse
from ..dtos.reader import (
    ProgressSaveResponse, ReadingProgressResponse,
    ReaderSettingsBody, ReadingProgressBody,
    ReaderSettingsGetResponse,  # response_model annotation
)
from ..events import EventScope, publish_domain_event_after_commit
from ..services import reader_service

router = APIRouter(tags=["reader"])


DEVICE_COOKIE = "device_id"
DEVICE_COOKIE_MAX_AGE = 10 * 365 * 24 * 60 * 60  # ~10 years


def _set_device_cookie(response, device_id: str):
    response.set_cookie(
        DEVICE_COOKIE,
        device_id,
        max_age=DEVICE_COOKIE_MAX_AGE,
        httponly=True,
        samesite="strict",
        path="/",
    )


@router.get("/api/reader/settings")
def api_get_settings(request: Request, response: Response, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]) -> ReaderSettingsGetResponse:
    device_id = reader_service.get_or_create_device_id(request.cookies.get(DEVICE_COOKIE))
    result = reader_service.get_settings(db, user.user_id, device_id)
    _set_device_cookie(response, device_id)
    return result


@router.put("/api/reader/settings")
def api_save_settings(body: ReaderSettingsBody, request: Request, response: Response, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]) -> OkResponse:
    device_id = reader_service.get_or_create_device_id(request.cookies.get(DEVICE_COOKIE))
    reader_service.save_settings(db, user.user_id, device_id, body)
    _set_device_cookie(response, device_id)
    return OkResponse()


@router.get("/api/reader/progress/{book_id}", response_model=ReadingProgressResponse)
def api_get_progress(book_id: int, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    return reader_service.get_progress(db, user.user_id, book_id)


@router.put("/api/reader/progress/{book_id}", response_model=ProgressSaveResponse)
def api_save_progress(book_id: int, body: ReadingProgressBody, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    result = reader_service.save_progress(db, user.user_id, book_id, body)
    if result.event_payload is not None:
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="user", user_id=user.user_id),
            event_type="readingProgressChanged",
            payload=result.event_payload,
        )
    return result.response
