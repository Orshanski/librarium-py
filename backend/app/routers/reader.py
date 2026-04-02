from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from ..auth import get_current_user
from ..dal.reader import (
    get_reader_settings,
    save_reader_settings,
    get_reading_progress,
    save_reading_progress,
)

router = APIRouter(tags=["reader"])


@router.get("/api/reader/settings")
def api_get_settings(device_type: str, request: Request):
    user = get_current_user(request)
    settings = get_reader_settings(user["userId"], device_type)
    return {"settings": settings}


@router.put("/api/reader/settings")
async def api_save_settings(request: Request):
    user = get_current_user(request)
    body = await request.json()
    device_type = body.get("device_type")
    settings = body.get("settings", {})
    if not device_type:
        return JSONResponse({"error": "device_type required"}, status_code=400)
    save_reader_settings(user["userId"], device_type, settings)
    return {"ok": True}


@router.get("/api/reader/progress/{book_id}")
def api_get_progress(book_id: int, request: Request):
    user = get_current_user(request)
    progress = get_reading_progress(user["userId"], book_id)
    return progress


@router.put("/api/reader/progress/{book_id}")
async def api_save_progress(book_id: int, request: Request):
    user = get_current_user(request)
    body = await request.json()
    position = body.get("position")
    last_device = body.get("last_device", "")
    if not position:
        return JSONResponse({"error": "position required"}, status_code=400)
    save_reading_progress(user["userId"], book_id, position, last_device)
    return {"ok": True}
