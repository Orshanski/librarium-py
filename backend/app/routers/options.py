from fastapi import APIRouter, Request
from ..auth import get_current_user
from ..database import get_db, dicts_from_rows

router = APIRouter(tags=["options"])


@router.get("/api/options")
def get_options(request: Request):
    get_current_user(request)
    db = get_db()

    authors = dicts_from_rows(db.execute(
        "SELECT id, name FROM authors ORDER BY sort_name COLLATE NOCASE"
    ).fetchall())

    series = dicts_from_rows(db.execute(
        "SELECT id, name FROM series ORDER BY sort_name COLLATE NOCASE"
    ).fetchall())

    tags = dicts_from_rows(db.execute("""
        SELECT t.id, t.name, COUNT(bt.book_id) as book_count
        FROM tags t JOIN book_tags bt ON t.id = bt.tag_id
        GROUP BY t.id ORDER BY t.name COLLATE NOCASE
    """).fetchall())

    languages = [r["language"] for r in db.execute(
        "SELECT DISTINCT language FROM books WHERE language IS NOT NULL ORDER BY language"
    ).fetchall()]

    publishers = [r["publisher"] for r in db.execute(
        "SELECT DISTINCT publisher FROM books WHERE publisher IS NOT NULL AND publisher != '' ORDER BY publisher"
    ).fetchall()]

    return {"authors": authors, "series": series, "tags": tags, "languages": languages, "publishers": publishers}
