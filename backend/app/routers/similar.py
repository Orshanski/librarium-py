import logging
import requests
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from ..auth import get_current_user
from ..dal.books import get_book_by_id
from ..database import get_db

log = logging.getLogger("librarium.similar")
router = APIRouter(tags=["similar"])

API_URL = "https://api.litres.ru/foundation/api"
META_URL = "https://www.litres.ru"
COVER_BASE = "https://cv5.litres.ru"
TIMEOUT = 15

_session = requests.Session()
_session.headers.update({
    "User-Agent": "Librarium-Metadata/1.0",
    "Accept": "application/json",
    "Accept-Language": "ru-RU,ru;q=0.9",
    "ui-language-code": "ru",
})


@router.get("/api/books/{book_id}/similar")
def get_similar(book_id: int, request: Request):
    get_current_user(request)

    book = get_book_by_id(book_id)
    if not book:
        return JSONResponse({"error": "Not found"}, status_code=404)

    title = book["title"]
    authors = book.get("authors") or ""
    first_author = authors.split(",")[0].strip() if authors else ""
    query = f"{title} {first_author}".strip()

    try:
        litres_id = _find_litres_id(query, title)
        if not litres_id:
            return {"books": [], "source": "litres"}

        similar = _fetch_similar(litres_id)
        similar = _exclude_owned(similar)
        return {"books": similar, "source": "litres"}
    except Exception as e:
        log.warning("Similar books error for book_id=%d: %s", book_id, e)
        return {"books": [], "source": "litres"}


def _find_litres_id(query: str, title: str) -> int | None:
    resp = _session.get(f"{API_URL}/search", params={
        "q": query,
        "limit": 5,
        "types": ["text_book"],
    }, timeout=TIMEOUT)
    if resp.status_code != 200:
        return None

    items = resp.json().get("payload", {}).get("data", [])
    title_lower = title.lower()
    for item in items:
        instance = item.get("instance", {})
        item_title = (instance.get("title") or "").lower()
        if title_lower in item_title or item_title in title_lower:
            return instance.get("id")

    # Fallback: return first result
    if items:
        return items[0].get("instance", {}).get("id")
    return None


def _fetch_similar(litres_id: int) -> list[dict]:
    resp = _session.get(f"{API_URL}/arts/{litres_id}/similar", params={
        "limit": 24,
        "offset": 0,
    }, timeout=TIMEOUT)
    if resp.status_code != 200:
        return []

    items = resp.json().get("payload", {}).get("data", [])
    results = []
    for item in items:
        # Filter: only ebooks (0) and PDF (4), skip audio (1)
        if item.get("art_type") not in (0, 4):
            continue

        rating_data = item.get("rating", {})
        rating_avg = rating_data.get("rated_avg", 0)
        rating_count = rating_data.get("rated_total_count", 0)

        # Filter: need enough ratings
        if rating_count < 5:
            continue

        # Authors
        authors = ", ".join(
            p.get("full_name", "")
            for p in item.get("persons", [])
            if p.get("role", "").lower() in ("author", "")
        )

        # Cover URL via our proxy
        cover_rel = item.get("cover_url", "")
        cover_url = f"/api/metadata/cover-proxy?url={COVER_BASE}{cover_rel}" if cover_rel else ""

        # Litres URL
        litres_url = f"{META_URL}{item.get('url', '')}"

        results.append({
            "title": item.get("title", ""),
            "authors": authors,
            "coverUrl": cover_url,
            "litresUrl": litres_url,
            "rating": round(rating_avg, 1),
            "ratingCount": rating_count,
        })

    # Sort by rating desc, no limit — show all that passed filters
    results.sort(key=lambda r: r["rating"], reverse=True)
    return results


def _exclude_owned(books: list[dict]) -> list[dict]:
    db = get_db()
    rows = db.execute("""
        SELECT lower_utf8(b.title), lower_utf8(MIN(a.name))
        FROM books b
        LEFT JOIN book_authors ba ON b.id = ba.book_id
        LEFT JOIN authors a ON ba.author_id = a.id
        GROUP BY b.id
    """).fetchall()
    owned = {(r[0], r[1]) for r in rows if r[0]}

    result = []
    for book in books:
        title = book["title"].lower()
        first_author = book["authors"].split(",")[0].strip().lower() if book["authors"] else ""
        if (title, first_author) not in owned:
            result.append(book)
    return result
