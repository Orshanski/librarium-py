"""Builder: конвертирует snake_case DAL-ряд в BookItem.

Используется в shelves_service при сборке ответа.
Единая точка сборки гарантирует согласованный маппинг полей.

Ряды приходят после обработки parse_book_row_aggregates:
- authors: list[AuthorRef]   (не CSV-строка)
- tags: list[TagRef]         (не CSV-строка)
- series: SeriesRef | None   (не плоские series_name + series_id)
"""
from ..dtos.book_card import BookCardItem
from ..dtos.books import BookItem


def row_to_book_card_item(row: dict) -> BookCardItem:
    """Maps a DAL row (snake_case) into BookCardItem.

    Row contract (guaranteed by parse_book_row_aggregates):
    - authors: list[AuthorRef]
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
    )


def row_to_book_item(row: dict) -> BookItem:
    """Маппинг row из DAL (snake_case) в BookItem.

    Контракт row на входе (гарантируется parse_book_row_aggregates):
    - row['authors'] — list[AuthorRef], отсутствует или пустой список для
      запросов без author-агрегата;
    - row['tags'] — list[TagRef], аналогично;
    - row['series'] — SeriesRef | None.
    Ref-поля проходят насквозь без распаковки.
    """
    book_id = row["id"]
    updated_at = row["updated_at"]

    return BookItem(
        id=book_id,
        title=row["title"],
        cover_path=f"/api/covers/{book_id}?t={updated_at}",
        authors=row.get("authors") or [],
        tags=row.get("tags") or [],
        series=row.get("series"),
        series_number=row.get("series_number"),
        added_at=row["added_at"],
        updated_at=updated_at,
        sort_title=row.get("sort_title"),
        description=row.get("description"),
        language=row.get("language"),
        publisher=row.get("publisher"),
        pub_date=row.get("pub_date"),
        rating=row.get("rating"),
        is_read=bool(row["is_read"]) if row.get("is_read") is not None else None,
        fraction=row.get("fraction"),
        last_format=row.get("last_format"),
        last_read_at=row.get("last_read_at"),
    )
