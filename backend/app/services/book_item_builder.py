"""Builder: converts snake_case DAL row to camelCase BookItem.

Used in shelves_service and tags_service when building the response.
One central builder guarantees consistent field mapping.

Rows arriving here have already been processed by parse_book_row_aggregates:
- authors: list[AuthorRef]   (not a CSV string)
- tags: list[TagRef]         (not a CSV string)
- series: SeriesRef | None   (not flat series_name + series_id columns)
"""
from ..dtos.books import BookItem
from ..dtos._refs import AuthorRef, SeriesRef, TagRef


def row_to_book_item(row: dict) -> BookItem:
    """Map snake_case DAL row to BookItem.

    Required fields: id, title, updated_at, authors, tags, added_at.
    Optional fields are read via row.get().
    """
    book_id = row["id"]
    updated_at = row["updated_at"]

    raw_authors: list[AuthorRef] = row.get("authors") or []
    raw_tags: list[TagRef] = row.get("tags") or []
    series: SeriesRef | None = row.get("series")

    return BookItem(
        id=book_id,
        title=row["title"],
        coverPath=f"/api/covers/{book_id}?t={updated_at}",
        authors=[a.name for a in raw_authors],
        authorIds=[a.id for a in raw_authors],
        tags=[t.name for t in raw_tags],
        tagIds=[t.id for t in raw_tags],
        addedAt=row["added_at"],
        updatedAt=updated_at,
        sortTitle=row.get("sort_title"),
        description=row.get("description"),
        language=row.get("language"),
        publisher=row.get("publisher"),
        pubDate=row.get("pub_date"),
        series=series.name if series is not None else None,
        seriesId=series.id if series is not None else None,
        seriesNumber=row.get("series_number"),
        rating=row.get("rating"),
        isRead=bool(row["is_read"]) if row.get("is_read") is not None else None,
        fraction=row.get("fraction"),
        lastFormat=row.get("last_format"),
        lastReadAt=row.get("last_read_at"),
    )
