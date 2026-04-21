"""Sort ORDER BY mappings. Used by dal/books.py, dal/shelves.py, dal/tags.py.

UserSort — Literal из 8 sort-значений, допустимых в query-параметре
от пользователя. Catalog/shelf/tag routers валидируют через FastAPI.
last_read_desc не входит в UserSort — его не может передать пользователь,
оно применяется backend'ом для reading_now shelf через SORT_CONFIG.
"""
from typing import Literal

UserSort = Literal[
    "added_desc", "added_asc",
    "title_asc", "title_desc",
    "author_asc", "author_desc",
    "rating_desc", "rating_asc",
]

# SQL fragments with leading "ORDER BY " and deterministic tie-breakers.
# Includes last_read_desc — internal key for reading_now shelf.
_ORDER_CLAUSES: dict[str, str] = {
    "added_desc": "ORDER BY b.added_at DESC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "added_asc": "ORDER BY b.added_at ASC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "title_asc": "ORDER BY COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC, b.added_at DESC",
    "title_desc": "ORDER BY COALESCE(b.sort_title, b.title) COLLATE NOCASE DESC, b.added_at DESC",
    "author_asc": "ORDER BY MIN(a.sort_name) COLLATE NOCASE ASC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "author_desc": "ORDER BY MIN(a.sort_name) COLLATE NOCASE DESC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "rating_desc": "ORDER BY ub.rating DESC NULLS LAST, b.added_at DESC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "rating_asc": "ORDER BY ub.rating ASC NULLS LAST, b.added_at DESC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "last_read_desc": "ORDER BY rp.last_read_at DESC, b.added_at DESC",
}


def resolve_order_clause(sort: str) -> str:
    """Return ORDER BY SQL fragment. Accepts any key from the mapping
    (UserSort values + internal "last_read_desc"). Caller responsibility
    to ensure requested key has required JOIN aliases in the query."""
    try:
        return _ORDER_CLAUSES[sort]
    except KeyError as exc:
        raise ValueError(f"Unknown sort key: {sort!r}. Expected one of {sorted(_ORDER_CLAUSES)}") from exc
