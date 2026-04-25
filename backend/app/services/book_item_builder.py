"""Builder: converts snake_case DAL row to camelCase BookItem.

Used in shelves_service and tags_service when building the response.
One central builder guarantees consistent field mapping.

Rows arriving here have already been processed by parse_book_row_aggregates:
- authors: list[AuthorRef]   (not a CSV string)
- tags: list[TagRef]         (not a CSV string)
- series: SeriesRef | None   (not flat series_name + series_id columns)
"""
from ..dtos.books import BookItem


def row_to_book_item(row: dict) -> BookItem:
    """Маппинг row из DAL (snake_case) в BookItem (camelCase wire).
    После pbz2 Task 9: row['authors'] уже list[AuthorRef], row['tags'] уже
    list[TagRef], row['series'] уже SeriesRef | None. Bridge схлопывается
    до passthrough.
    """
    book_id = row["id"]
    updated_at = row["updated_at"]

    return BookItem(
        id=book_id,
        title=row["title"],
        coverPath=f"/api/covers/{book_id}?t={updated_at}",
        authors=row.get("authors") or [],
        tags=row.get("tags") or [],
        series=row.get("series"),
        seriesNumber=row.get("series_number"),
        addedAt=row["added_at"],
        updatedAt=updated_at,
        sortTitle=row.get("sort_title"),
        description=row.get("description"),
        language=row.get("language"),
        publisher=row.get("publisher"),
        pubDate=row.get("pub_date"),
        rating=row.get("rating"),
        isRead=bool(row["is_read"]) if row.get("is_read") is not None else None,
        fraction=row.get("fraction"),
        lastFormat=row.get("last_format"),
        lastReadAt=row.get("last_read_at"),
    )
