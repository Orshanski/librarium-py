import sqlite3
from fastapi import APIRouter, Depends
from ..auth import get_current_user
from ..database import db_session
from ..dal.books import search_books

router = APIRouter(tags=["search"])


@router.get("/api/search")
def search(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session), q: str = "", limit: int = 50):
    limit = min(limit, 100)
    if not q.strip():
        return {"books": [], "authors": [], "series": []}
    return search_books(db, q.strip(), limit)
