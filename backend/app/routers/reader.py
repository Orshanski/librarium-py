import sqlite3
import uuid
from typing import Any
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from ..auth import get_current_user
from ..database import db_session
from ..dal.reader import (
    get_reader_settings,
    save_reader_settings,
    get_reading_progress,
    save_reading_progress,
)

router = APIRouter(tags=["reader"])


class ReaderSettingsBody(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)


class ReadingProgressBody(BaseModel):
    position: str
    last_device: str = ""
    last_format: str = ""
    fraction: float = Field(0, ge=0, le=1)
    expected_version: int = Field(0, ge=0)


DEVICE_COOKIE = "device_id"
DEVICE_COOKIE_MAX_AGE = 10 * 365 * 24 * 60 * 60  # ~10 years


def _get_or_create_device_id(request: Request, response: JSONResponse | None = None):
    """Get device_id from cookie, or generate a new one."""
    device_id = request.cookies.get(DEVICE_COOKIE)
    if not device_id:
        device_id = str(uuid.uuid4())
    return device_id


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
def api_get_settings(request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    device_id = _get_or_create_device_id(request)
    settings = get_reader_settings(db, user["userId"], device_id)
    response = JSONResponse({"settings": settings})
    _set_device_cookie(response, device_id)
    return response


@router.put("/api/reader/settings")
def api_save_settings(body: ReaderSettingsBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    device_id = _get_or_create_device_id(request)
    save_reader_settings(db, user["userId"], device_id, body.settings)
    response = JSONResponse({"ok": True})
    _set_device_cookie(response, device_id)
    return response


@router.get("/api/reader/progress/{book_id}")
def api_get_progress(book_id: int, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    progress = get_reading_progress(db, user["userId"], book_id)
    return progress


@router.put("/api/reader/progress/{book_id}")
def api_save_progress(book_id: int, body: ReadingProgressBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = get_current_user(request)
    return save_reading_progress(
        db, user["userId"], book_id,
        body.position, body.last_device, body.last_format, body.fraction,
        body.expected_version,
    )
