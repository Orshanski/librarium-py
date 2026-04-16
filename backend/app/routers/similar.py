import logging
import sqlite3
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from ..auth import get_current_user
from ..database import db_session
from ..dal.books import get_book_by_id
from ..dal.similar import exclude_owned
from ..providers.litres import find_litres_id, fetch_similar

log = logging.getLogger("librarium.similar")
router = APIRouter(tags=["similar"])


@router.get("/api/books/{book_id}/similar")
def get_similar(book_id: int, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):

    book = get_book_by_id(db, book_id)
    if not book:
        return JSONResponse({"error": "Not found"}, status_code=404)

    title = book["title"]
    authors = book.get("authors") or ""
    first_author = authors.split(",")[0].strip() if authors else ""
    query = f"{title} {first_author}".strip()

    try:
        litres_id = find_litres_id(query, title)
        if not litres_id:
            return {"books": [], "source": "litres", "error": None}

        similar = fetch_similar(litres_id)
        similar = exclude_owned(db, similar)
        return {"books": similar, "source": "litres", "error": None}
    except Exception as e:
        log.warning("Similar books error for book_id=%d: %s", book_id, e)
        return {"books": [], "source": "litres", "error": "service_unavailable"}
