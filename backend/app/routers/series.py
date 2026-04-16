import logging
import sqlite3
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from ..auth import get_current_user, require_admin
from ..database import db_session
from ..dal import series as dal
from .params import parse_ids

log = logging.getLogger("librarium.series")
router = APIRouter(prefix="/api/series", tags=["series"])


@router.get("")
def list_series(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), authorIds: str = "", tagIds: str = "", language: str = ""):
    return dal.get_series(db, parse_ids(authorIds), parse_ids(tagIds), language or None, user_id=user["userId"])


@router.get("/{series_id}")
def get_series(series_id: int, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    result = dal.get_series_by_id(db, series_id)
    if not result:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return result


class RenameBody(BaseModel):
    name: str


@router.put("/{series_id}")
def rename_series(series_id: int, body: RenameBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    dal.rename_series(db, series_id, body.name.strip())
    log.info("Renamed series=%d to=%s by user_id=%s", series_id, body.name.strip(), user["userId"])
    return {"ok": True}


class MergeBody(BaseModel):
    sourceId: int


@router.post("/{series_id}/merge")
def merge_series(series_id: int, body: MergeBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    if body.sourceId == series_id:
        return JSONResponse({"error": "Нельзя объединить с самой собой"}, status_code=400)
    dal.merge_series(db, series_id, body.sourceId)
    log.info("Merged series source=%d into target=%d by user_id=%s",
             body.sourceId, series_id, user["userId"])
    return {"ok": True}


@router.delete("/{series_id}")
def delete_series(series_id: int, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    err = dal.delete_series(db, series_id)
    if err == "not_found":
        return JSONResponse({"error": "Серия не найдена"}, status_code=404)
    if err == "has_books":
        return JSONResponse({"error": "Нельзя удалить серию с книгами"}, status_code=400)
    log.info("Deleted series=%d by user_id=%s", series_id, user["userId"])
    return {"ok": True}
