"""Builder: конвертирует snake_case DAL row → camelCase BookItem.

Используется в shelves_service и tags_service при формировании response.
Один центральный билдер гарантирует консистентный маппинг полей.
"""
from ..dtos.books import BookItem


def _split_csv(s: str | None) -> list[str]:
    if not s:
        return []
    return [x for x in s.split(",") if x]


def _split_csv_int(s: str | None) -> list[int]:
    if not s:
        return []
    return [int(x) for x in s.split(",") if x]


def row_to_book_item(row: dict) -> BookItem:
    """Маппинг snake_case row из DAL в BookItem.

    Обязательные поля: id, title, updated_at, authors, author_ids, tags,
    tag_ids, added_at. Опциональные берутся через row.get().
    """
    book_id = row["id"]
    updated_at = row.get("updated_at") or ""
    return BookItem(
        id=book_id,
        title=row["title"],
        coverPath=f"/api/covers/{book_id}?t={updated_at}",
        authors=_split_csv(row.get("authors")),
        authorIds=_split_csv_int(row.get("author_ids")),
        tags=_split_csv(row.get("tags")),
        tagIds=_split_csv_int(row.get("tag_ids")),
        addedAt=row["added_at"],
        updatedAt=row["updated_at"],
        sortTitle=row.get("sort_title"),
        description=row.get("description"),
        language=row.get("language"),
        publisher=row.get("publisher"),
        pubDate=row.get("pub_date"),
        series=row.get("series_name"),
        seriesId=row.get("series_id"),
        seriesNumber=row.get("series_number"),
        rating=row.get("rating"),
        isRead=bool(row["is_read"]) if row.get("is_read") is not None else None,
        fraction=row.get("fraction"),
        lastFormat=row.get("last_format"),
        lastReadAt=row.get("last_read_at"),
    )
