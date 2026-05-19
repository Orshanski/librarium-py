"""Service-layer для authors: raise'ы для not-found и self-merge; делегация в DAL."""
import sqlite3

from ..dal import authors as dal
from ..dtos.entities import AuthorDetailResponse, AuthorsListResponse
from ..exceptions import BadInputError, NotFoundError


def list_authors(
    db: sqlite3.Connection,
    user_id: int,
    tag_ids: list[int] | None,
    language: list[str] | None,
) -> AuthorsListResponse:
    result = dal.get_authors(db, user_id=user_id, tag_ids=tag_ids, language=language)
    return AuthorsListResponse(authors=result["authors"])


def get_author(db: sqlite3.Connection, author_id: int, user_id: int) -> AuthorDetailResponse:
    """Read author detail. user_id is required: books[] now carries per-user
    rating/is_read via the user_books LEFT JOIN in get_author_books.sql."""
    result = dal.get_author_by_id(db, author_id, user_id)
    if not result:
        raise NotFoundError("Not found")
    return AuthorDetailResponse(author=result["author"], books=result["books"])


def rename_author(db: sqlite3.Connection, author_id: int, name: str) -> bool:
    """Переименовать автора. Raises NotFoundError если автор не существует.

    Existence check уходит на thin queries.author_exists (как в delete_author),
    а имя читается напрямую через queries.get_author_by_id — без user-scoped
    запроса get_author_by_id из DAL, который тянет user_books JOIN."""
    if not dal.queries.author_exists(db, id=author_id):
        raise NotFoundError("Автор не найден")
    row = dal.queries.get_author_by_id(db, id=author_id)
    if row["name"] == name:
        return False
    dal.rename_author(db, author_id, name)
    return True


def merge_authors(db: sqlite3.Connection, target_id: int, source_id: int) -> bool:
    if target_id == source_id:
        raise BadInputError("Нельзя объединить с самим собой")
    if not dal.queries.author_exists(db, id=source_id):
        return False
    dal.merge_authors(db, target_id, source_id)
    return True


def delete_author(db: sqlite3.Connection, author_id: int) -> None:
    """Делегация. DAL raise'ит NotFoundError/BadInputError (T5) — пропагируем."""
    dal.delete_author(db, author_id)
