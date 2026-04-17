import logging
import sqlite3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user, require_admin
from ..database import db_session
from ..dal import authors as dal
from .params import parse_ids

log = logging.getLogger("librarium.authors")
router = APIRouter(prefix="/api/authors", tags=["authors"])


@router.get("")
def list_authors(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), tagIds: str = "", language: str = ""):
    return dal.get_authors(db, parse_ids(tagIds), language or None, user_id=user["userId"])


@router.get("/{author_id}")
def get_author(author_id: int, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    result = dal.get_author_by_id(db, author_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


class RenameBody(BaseModel):
    name: str


@router.put("/{author_id}")
def rename_author(author_id: int, body: RenameBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    if not dal.get_author_by_id(db, author_id):
        raise HTTPException(status_code=404, detail="Автор не найден")
    dal.rename_author(db, author_id, body.name.strip())
    log.info("Renamed author=%d to=%s by user_id=%s", author_id, body.name.strip(), user["userId"])
    return {"ok": True}


class MergeBody(BaseModel):
    sourceId: int


@router.post("/{author_id}/merge")
def merge_author(author_id: int, body: MergeBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    if body.sourceId == author_id:
        raise HTTPException(status_code=400, detail="Нельзя объединить с самим собой")
    dal.merge_authors(db, author_id, body.sourceId)
    log.info("Merged author source=%d into target=%d by user_id=%s",
             body.sourceId, author_id, user["userId"])
    return {"ok": True}


@router.delete("/{author_id}")
def delete_author(author_id: int, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    err = dal.delete_author(db, author_id)
    if err == "not_found":
        raise HTTPException(status_code=404, detail="Автор не найден")
    if err == "has_books":
        raise HTTPException(status_code=400, detail="Нельзя удалить автора с книгами")
    log.info("Deleted author=%d by user_id=%s", author_id, user["userId"])
    return {"ok": True}
