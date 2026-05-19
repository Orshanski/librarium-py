"""Service-layer для series: raise'ы для not-found и self-merge; делегация в DAL."""
import sqlite3

from ..dal import series as dal
from ..dtos.entities import SeriesDetailResponse, SeriesListResponse
from ..exceptions import BadInputError, NotFoundError


def list_series(
    db: sqlite3.Connection,
    user_id: int,
    author_ids: list[int] | None,
    tag_ids: list[int] | None,
    language: list[str] | None,
) -> SeriesListResponse:
    result = dal.get_series(db, user_id=user_id, author_ids=author_ids, tag_ids=tag_ids, language=language)
    return SeriesListResponse(series=result["series"])


def get_series(db: sqlite3.Connection, series_id: int, user_id: int) -> SeriesDetailResponse:  # noqa: ARG001
    """Read series detail. ``user_id`` is accepted for shared-router-factory
    parity with ``authors_service.get_author``; it will be wired into the
    user_books JOIN in Task 2.2 (series detail SQL). Currently unused."""
    result = dal.get_series_by_id(db, series_id)
    if not result:
        raise NotFoundError("Not found")
    return SeriesDetailResponse(series=result["series"], books=result["books"])


def rename_series(db: sqlite3.Connection, series_id: int, name: str) -> bool:
    """Переименовать серию. Raises NotFoundError если серия не существует."""
    result = dal.get_series_by_id(db, series_id)
    if not result:
        raise NotFoundError("Серия не найдена")
    if result["series"]["name"] == name:
        return False
    dal.rename_series(db, series_id, name)
    return True


def merge_series(db: sqlite3.Connection, target_id: int, source_id: int) -> bool:
    if target_id == source_id:
        raise BadInputError("Нельзя объединить с самой собой")
    if not dal.get_series_by_id(db, source_id):
        return False
    dal.merge_series(db, target_id, source_id)
    return True


def delete_series(db: sqlite3.Connection, series_id: int) -> None:
    """Делегация. DAL raise'ит NotFoundError/BadInputError (T5) — пропагируем."""
    dal.delete_series(db, series_id)
