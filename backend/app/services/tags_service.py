"""Service-layer для tags: raise NotFoundError на отсутствующие теги."""
import sqlite3

from ..dal import tags as dal
from ..exceptions import NotFoundError


def tag_cloud(db: sqlite3.Connection, top: int | None) -> dict:
    return {"tags": dal.get_tag_cloud(db, top)}


def get_tag(
    db: sqlite3.Connection,
    tag_id: int,
    author_ids: list[int],
    series_ids: list[int],
    language: str | None,
) -> dict:
    result = dal.get_tag_by_id(db, tag_id, author_ids, series_ids, language)
    if not result:
        raise NotFoundError("Not found")
    return result


def map_tag(db: sqlite3.Connection, tag_id: int, name: str) -> dict:
    """Renames tag to `name`, или merges в existing tag с таким именем.
    Raises NotFoundError если tag_id не существует."""
    if not dal.tag_exists(db, tag_id):
        raise NotFoundError("Not found")
    return dal.map_tag(db, tag_id, name)
