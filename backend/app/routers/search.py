import sqlite3
from fastapi import APIRouter, Depends
from ..auth import get_current_user
from ..database import db_session
from ..services import search_service

router = APIRouter(tags=["search"])


@router.get("/api/search")
def search(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), q: str = "", limit: int = 50):
    return search_service.search(db, q, limit)
