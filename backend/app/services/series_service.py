"""Service-layer для series: raise'ы для not-found и self-merge; делегация в DAL."""
import sqlite3

from ..dal import series as dal
from ..exceptions import BadInputError, NotFoundError


def get_series(db: sqlite3.Connection, series_id: int) -> dict:
    result = dal.get_series_by_id(db, series_id)
    if not result:
        raise NotFoundError("Not found")
    return result


def rename_series(db: sqlite3.Connection, series_id: int, name: str) -> None:
    dal.rename_series(db, series_id, name)


def merge_series(db: sqlite3.Connection, target_id: int, source_id: int) -> None:
    if target_id == source_id:
        raise BadInputError("Нельзя объединить с самой собой")
    dal.merge_series(db, target_id, source_id)


def delete_series(db: sqlite3.Connection, series_id: int) -> None:
    """Делегация. DAL raise'ит NotFoundError/BadInputError (T5) — пропагируем."""
    dal.delete_series(db, series_id)
