from fastapi import APIRouter, Request
from ..auth import get_current_user
from ..dal.books import search_books

router = APIRouter(tags=["search"])


@router.get("/api/search")
def search(request: Request, q: str = "", limit: int = 50):
    get_current_user(request)
    if not q.strip():
        return {"books": [], "authors": [], "series": []}
    return search_books(q.strip(), limit)
