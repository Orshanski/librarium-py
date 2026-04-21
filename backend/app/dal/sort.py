"""Sort ORDER BY mappings. Used by dal/books.py, dal/shelves.py, dal/tags.py.

UserSort — Literal из 8 sort-значений, допустимых в query-параметре
от пользователя. Catalog/shelf/tag routers валидируют через FastAPI.
lastReadDesc не входит в UserSort — его не может передать пользователь,
оно применяется backend'ом для reading_now shelf через SORT_CONFIG.
"""
from ..dtos.catalog import UserSort as UserSort  # canonical definition lives in dtos

# SQL fragments with leading "ORDER BY " and deterministic tie-breakers.
# Includes lastReadDesc — internal key for reading_now shelf.
_ORDER_CLAUSES: dict[str, str] = {
    "addedDesc": "ORDER BY b.added_at DESC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "addedAsc": "ORDER BY b.added_at ASC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "titleAsc": "ORDER BY COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC, b.added_at DESC",
    "titleDesc": "ORDER BY COALESCE(b.sort_title, b.title) COLLATE NOCASE DESC, b.added_at DESC",
    "authorAsc": "ORDER BY MIN(a.sort_name) COLLATE NOCASE ASC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "authorDesc": "ORDER BY MIN(a.sort_name) COLLATE NOCASE DESC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "ratingDesc": "ORDER BY ub.rating DESC NULLS LAST, b.added_at DESC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "ratingAsc": "ORDER BY ub.rating ASC NULLS LAST, b.added_at DESC, COALESCE(b.sort_title, b.title) COLLATE NOCASE ASC",
    "lastReadDesc": "ORDER BY rp.last_read_at DESC, b.added_at DESC",
}


def resolve_order_clause(sort: str) -> str:
    """Return ORDER BY SQL fragment. Accepts any key from the mapping
    (UserSort values + internal "last_read_desc"). Caller responsibility
    to ensure requested key has required JOIN aliases in the query."""
    try:
        return _ORDER_CLAUSES[sort]
    except KeyError as exc:
        raise ValueError(f"Unknown sort key: {sort!r}. Expected one of {sorted(_ORDER_CLAUSES)}") from exc
