import sqlite3
from fastapi import APIRouter, Depends, Request
from ..auth import get_current_user
from ..database import db_session
from ..dal.books import get_all_publishers

router = APIRouter(tags=["publishers"])


@router.get("/api/publishers")
def list_publishers(request: Request, db: sqlite3.Connection = Depends(db_session)):
    get_current_user(request)
    return {"publishers": get_all_publishers(db)}
