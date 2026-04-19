import sqlite3
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.reader import ReaderSettingsBody, ReadingProgressBody
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
def api_get_settings(request: Request, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    device_id = reader_service.get_or_create_device_id(request.cookies.get(DEVICE_COOKIE))
    settings = reader_service.get_settings(db, user.user_id, device_id)
    response = JSONResponse({"settings": settings})
    _set_device_cookie(response, device_id)
    return response


@router.put("/api/reader/settings")
def api_save_settings(body: ReaderSettingsBody, request: Request, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    device_id = reader_service.get_or_create_device_id(request.cookies.get(DEVICE_COOKIE))
    reader_service.save_settings(db, user.user_id, device_id, body)
    response = JSONResponse({"ok": True})
    _set_device_cookie(response, device_id)
    return response


@router.get("/api/reader/progress/{book_id}")
def api_get_progress(book_id: int, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    return reader_service.get_progress(db, user.user_id, book_id)


@router.put("/api/reader/progress/{book_id}")
def api_save_progress(book_id: int, body: ReadingProgressBody, user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)) -> dict:
    return reader_service.save_progress(
        db, user.user_id, book_id,
        body.position, body.last_device, body.last_format, body.fraction,
        body.expected_version,
    )
