import sqlite3
from fastapi import APIRouter, Depends
from ..auth import get_current_user
from ..database import db_session
from ..services import publishers_service

router = APIRouter(tags=["publishers"])


@router.get("/api/publishers")
def list_publishers(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    return {"publishers": publishers_service.list_publishers(db)}
