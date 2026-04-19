"""Service-layer для authors: raise'ы для not-found и self-merge; делегация в DAL."""
import sqlite3

from ..dal import authors as dal
from ..exceptions import BadInputError, NotFoundError


def list_authors(
    db: sqlite3.Connection,
    user_id: int,
    tag_ids: list[int] | None,
    language: str | None,
) -> list[dict]:
    return dal.get_authors(db, user_id=user_id, tag_ids=tag_ids, language=language)


def get_author(db: sqlite3.Connection, author_id: int) -> dict:
    result = dal.get_author_by_id(db, author_id)
    if not result:
        raise NotFoundError("Not found")
    return result


def rename_author(db: sqlite3.Connection, author_id: int, name: str) -> None:
    """Переименовать автора. Raises NotFoundError если автор не существует."""
    if not dal.get_author_by_id(db, author_id):
        raise NotFoundError("Автор не найден")
    dal.rename_author(db, author_id, name)


def merge_authors(db: sqlite3.Connection, target_id: int, source_id: int) -> None:
    if target_id == source_id:
        raise BadInputError("Нельзя объединить с самим собой")
    dal.merge_authors(db, target_id, source_id)


def delete_author(db: sqlite3.Connection, author_id: int) -> None:
    """Делегация. DAL raise'ит NotFoundError/BadInputError (T5) — пропагируем."""
    dal.delete_author(db, author_id)
