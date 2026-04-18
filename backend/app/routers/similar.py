import logging
import sqlite3

from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..dal.books import get_book_by_id
from ..dal.similar import exclude_owned
from ..database import db_session
from ..exceptions import BadInputError, ForbiddenError, NotFoundError, UpstreamError
from ..providers.litres import find_litres_id, fetch_similar

log = logging.getLogger("librarium.similar")
router = APIRouter(tags=["similar"])


@router.get("/api/books/{book_id}/similar")
def get_similar(
    book_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(db_session),
):
    book = get_book_by_id(db, book_id)
    if not book:
        raise NotFoundError("Not found")

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
    except (BadInputError, ForbiddenError, NotFoundError, UpstreamError):
        # Наши domain exceptions — propagate к middleware, не маскировать под
        # "service_unavailable". Сейчас third-party провайдеры (litres) их не
        # raise'ят, но защита от будущих изменений в providers.
        raise
    except Exception as e:
        # Third-party/network errors — endpoint graceful-degrade с
        # error:"service_unavailable" вместо 502 (UX-decision, legacy).
        log.warning("Similar books error for book_id=%d: %s", book_id, e)
        return {"books": [], "source": "litres", "error": "service_unavailable"}
