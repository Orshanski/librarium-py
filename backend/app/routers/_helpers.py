"""
Shared router-layer helpers for entity routers (authors, series, tags, shelves).

Deliberately minimal — three pure functions that encode the exact repetitions
identified in the E3 spec. NO generic CRUDRouter / endpoint factory / decorator
magic — no generic CRUDRouter / endpoint factory — three helpers, end of list.
Adding more helpers here should be a conscious decision, not a drift.
"""
from fastapi import HTTPException


def require_exists(predicate: object, *, detail: str = "Not found") -> None:
    """Raise 404 when ``predicate`` is falsy.

    Used by the ``if not dal.<entity>_exists(...): raise 404`` idiom in
    shelves.update/delete/add_book/remove_book and tags.map_tag, and by the
    ``if not result: raise 404`` idiom in authors/series/shelves get-by-id.
    """
    if not predicate:
        raise HTTPException(status_code=404, detail=detail)


def raise_delete_error(
    code: "str | None",
    *,
    not_found_detail: str,
    has_books_detail: str,
) -> None:
    """Map DAL ``delete_*`` string-code return to HTTPException.

    DAL contract (authors/series):
      - ``"not_found"``  → 404 with ``not_found_detail``
      - ``"has_books"``  → 400 with ``has_books_detail``
      - ``None`` / ``""`` / unknown code → return silently (success path)

    Unknown-code silence is intentional: a future DAL code addition should not
    crash the router — the caller sees a "success" response for a code they
    don't handle yet. When E1 unifies DAL error contracts, this helper will be
    revisited.
    """
    if code == "not_found":
        raise HTTPException(status_code=404, detail=not_found_detail)
    if code == "has_books":
        raise HTTPException(status_code=400, detail=has_books_detail)


def guard_self_merge(target_id: int, source_id: int, *, detail: str) -> None:
    """Raise 400 when a merge target equals its source.

    Used by authors.merge_author and series.merge_series.
    """
    if target_id == source_id:
        raise HTTPException(status_code=400, detail=detail)
