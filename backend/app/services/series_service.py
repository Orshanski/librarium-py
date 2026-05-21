"""Service-layer для series: raise'ы для not-found и self-merge; делегация в DAL."""
import sqlite3

from ..dal import series as dal
from ..dtos.entities import SeriesDetailResponse, SeriesListResponse
from ..exceptions import BadInputError, NotFoundError
from .book_item_builder import row_to_book_card_item


def list_series(
    db: sqlite3.Connection,
    user_id: int,
    author_ids: list[int] | None,
    tag_ids: list[int] | None,
    language: list[str] | None,
) -> SeriesListResponse:
    result = dal.get_series(db, user_id=user_id, author_ids=author_ids, tag_ids=tag_ids, language=language)
    return SeriesListResponse(series=result["series"])


def get_series(db: sqlite3.Connection, series_id: int, user_id: int) -> SeriesDetailResponse:
    """Read series detail. user_id is required: books[] now carries per-user
    rating/is_read via the user_books LEFT JOIN in get_series_books.sql.

    books[] is mapped through row_to_book_card_item — the unified card-level
    contract (BookCardItem); detail-only fields stay in BookDetailResponse.
    """
    result = dal.get_series_by_id(db, series_id, user_id)
    if not result:
        raise NotFoundError("Not found")
    books = [row_to_book_card_item(r) for r in result["books"]]
    return SeriesDetailResponse(series=result["series"], books=books)


def rename_series(db: sqlite3.Connection, series_id: int, name: str) -> bool:
    """Переименовать серию. Raises NotFoundError если серия не существует.

    Existence check уходит на thin queries.series_exists (как в delete_series),
    а имя читается напрямую через queries.get_series_by_id — без user-scoped
    запроса get_series_by_id из DAL, который тянет user_books JOIN."""
    if not dal.queries.series_exists(db, id=series_id):
        raise NotFoundError("Серия не найдена")
    row = dal.queries.get_series_by_id(db, id=series_id)
    if row["name"] == name:
        return False
    dal.rename_series(db, series_id, name)
    return True


def merge_series(db: sqlite3.Connection, target_id: int, source_id: int) -> bool:
    if target_id == source_id:
        raise BadInputError("Нельзя объединить с самой собой")
    if not dal.queries.series_exists(db, id=source_id):
        return False
    dal.merge_series(db, target_id, source_id)
    return True


def delete_series(db: sqlite3.Connection, series_id: int) -> None:
    """Делегация. DAL raise'ит NotFoundError/BadInputError (T5) — пропагируем."""
    dal.delete_series(db, series_id)


def get_series_name(db: sqlite3.Connection, series_id: int) -> str:
    """Return series name by id. Raises NotFoundError if series does not exist.

    Используется register_entity_crud для re-read имени после успешного
    rename (payload события *Renamed). Симметрично get_tag_name/get_author_name."""
    row = dal.queries.get_series_by_id(db, id=series_id)
    if row is None:
        raise NotFoundError("Серия не найдена")
    return row["name"]
