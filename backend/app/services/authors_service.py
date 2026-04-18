"""Service-layer для authors: raise'ы для not-found и self-merge; делегация в DAL."""
import sqlite3

from ..dal import authors as dal
from ..exceptions import BadInputError, NotFoundError


def get_author(db: sqlite3.Connection, author_id: int) -> dict:
    result = dal.get_author_by_id(db, author_id)
    if not result:
        raise NotFoundError("Not found")
    return result


def rename_author(db: sqlite3.Connection, author_id: int, name: str) -> None:
    """DAL не проверяет существование; поведение сохраняется.
    Bug librarium-py-xzx.1 (silently succeeds on missing id) — отдельная задача."""
    dal.rename_author(db, author_id, name)


def merge_authors(db: sqlite3.Connection, target_id: int, source_id: int) -> None:
    if target_id == source_id:
        raise BadInputError("Нельзя объединить с самим собой")
    dal.merge_authors(db, target_id, source_id)


def delete_author(db: sqlite3.Connection, author_id: int) -> None:
    """Делегация. DAL raise'ит NotFoundError/BadInputError (T5) — пропагируем."""
    dal.delete_author(db, author_id)
