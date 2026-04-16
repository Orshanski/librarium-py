import sqlite3
from fastapi import APIRouter, Depends
from ..auth import get_current_user
from ..database import db_session
from ..dal.books import get_all_publishers

router = APIRouter(tags=["publishers"])


@router.get("/api/publishers")
def list_publishers(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    return {"publishers": get_all_publishers(db)}
