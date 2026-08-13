"""Builders: convert snake_case DAL row dicts into Pydantic response items.

Two builders cover the read-path response shapes:
- `row_to_book_card_item` — list endpoints (catalog, shelf, author, series,
  tag, search). Card-level fields only.
- `row_to_book_detail_item` — single-book detail endpoint. Card-level fields
  plus 7 detail fields (sort_title, description, language, publisher,
  pub_date, added_at, updated_at). `tags` is a card-shape field handled
  by `row_to_book_card_item`.

Both expect rows post `parse_book_row_aggregates`:
- authors: list[AuthorRef]   (parsed JSON, not CSV)
- tags:    list[TagRef]      (parsed JSON, not CSV)
- series:  SeriesRef | None  (parsed JSON, not flat series_id/series_name)
"""
from collections.abc import Mapping
from typing import Any

from ..dtos.book_card import BookCardItem, BookDetailItem


def row_to_book_card_item(row: Mapping[str, Any]) -> BookCardItem:
    """Maps a DAL row (snake_case) into BookCardItem.

    Row contract (guaranteed by parse_book_row_aggregates):
    - authors: list[AuthorRef]
    - tags: list[TagRef]
    - series: SeriesRef | None
    - is_read: int | None (0/1 from SQL, coerced to bool)
    """
    book_id = row["id"]
    updated_at = row["updated_at"]
    is_read_raw = row.get("is_read")
    return BookCardItem(
        id=book_id,
        title=row["title"],
        authors=row.get("authors") or [],
        series=row.get("series"),
        series_number=row.get("series_number"),
        cover_path=f"/api/covers/{book_id}?t={updated_at}",
        rating=row.get("rating"),
        is_read=bool(is_read_raw) if is_read_raw is not None else False,
        tags=row.get("tags") or [],
    )


def row_to_book_detail_item(row: Mapping[str, Any], has_recap: bool = False) -> BookDetailItem:
    """Maps a DAL row (snake_case) into BookDetailItem.

    Mirrors row_to_book_card_item plus 8 detail fields. cover_path is the
    API URL (`/api/covers/{id}?t=<updated_at>`), consistent with the unified
    BookCardItem contract — not the raw DB column value. `has_recap` is a
    precomputed flag (caller-supplied, by image of `cover_path`'s always-set
    contract) — the builder does not touch the filesystem itself.

    Row contract (guaranteed by parse_book_row_aggregates):
    - authors: list[AuthorRef]
    - tags: list[TagRef]
    - series: SeriesRef | None
    - is_read: int | None (0/1 from SQL, coerced to bool)
    """
    book_id = row["id"]
    updated_at = row["updated_at"]
    is_read_raw = row.get("is_read")
    return BookDetailItem(
        id=book_id,
        title=row["title"],
        authors=row.get("authors") or [],
        series=row.get("series"),
        series_number=row.get("series_number"),
        cover_path=f"/api/covers/{book_id}?t={updated_at}",
        rating=row.get("rating"),
        is_read=bool(is_read_raw) if is_read_raw is not None else False,
        sort_title=row.get("sort_title"),
        description=row.get("description"),
        language=row.get("language"),
        publisher=row.get("publisher"),
        pub_date=row.get("pub_date"),
        tags=row.get("tags") or [],
        added_at=row["added_at"],
        updated_at=updated_at,
        recap_path=f"/api/books/{book_id}/recap?t={updated_at}" if has_recap else None,
    )
