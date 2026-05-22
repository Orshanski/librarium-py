"""Service-layer для tags: raise NotFoundError на отсутствующие теги."""
import sqlite3

from ..dal import tags as dal
from ..dtos.catalog import UserSort
from ..dtos.entities import TagCloudResponse, TagDetailResponse, TagSummary
from ..exceptions import BadInputError, NotFoundError
from .book_item_builder import row_to_book_card_item


def tag_cloud(db: sqlite3.Connection, top: int | None) -> TagCloudResponse:
    return TagCloudResponse(tags=dal.get_tag_cloud(db, top))


def get_tag(
    db: sqlite3.Connection,
    tag_id: int,
    user_id: int,
    author_ids: list[int] | None,
    series_ids: list[int] | None,
    language: list[str] | None,
    sort: UserSort,
) -> TagDetailResponse:
    """Read tag detail with filters/sort. books[] is mapped through
    row_to_book_card_item — the unified card-level contract (BookCardItem);
    detail-only fields stay in BookDetailResponse."""
    result = dal.get_tag_by_id(
        db, tag_id, user_id,
        author_ids=author_ids, series_ids=series_ids, language=language, sort=sort,
    )
    if not result:
        raise NotFoundError("Not found")
    tag_row = result["tag"]
    books = [row_to_book_card_item(r) for r in result["books"]]
    return TagDetailResponse(
        tag=TagSummary(
            id=tag_row["id"],
            name=tag_row["name"],
            code=tag_row.get("code"),
            book_count=tag_row["book_count"],
        ),
        books=books,
    )


def get_tag_name(db: sqlite3.Connection, tag_id: int) -> str:
    """Return tag name by id. Raises NotFoundError if tag does not exist.

    Spec-уровневый контракт `→ str` (не `str | None`): обёртка над
    dal.get_tag_name (которая возвращает str | None), raise'ит NotFoundError
    при None. Используется register_entity_crud для re-read имени после
    успешного rename (payload события *Renamed)."""
    name = dal.get_tag_name(db, tag_id)
    if name is None:
        raise NotFoundError("Тег не найден")
    return name


def rename_tag(db: sqlite3.Connection, tag_id: int, name: str) -> bool:
    """Rename tag. Raises NotFoundError if tag does not exist.

    Сравнивает по нормализованному имени (не raw, как у series/authors).
    Это даёт идемпотентность повторного PUT с любым регистром/whitespace —
    осознанная асимметрия с rename_series.

    Returns True если имя реально изменилось, False если no-op."""
    if not dal.tag_exists(db, tag_id):
        raise NotFoundError("Тег не найден")
    normalized = dal.normalize_tag_name(name)
    current = dal.get_tag_name(db, tag_id)
    if current == normalized:
        return False
    dal.rename_tag(db, tag_id, normalized)
    return True


def merge_tag(db: sqlite3.Connection, target_id: int, source_id: int) -> bool:
    """Merge source tag into target. Симметрично merge_series.

    Returns True если merge произошёл, False если source не существует
    (silent no-op, как у merge_series). Raises BadInputError на self-merge.

    Существование target специально не проверяется — если его не существует,
    DAL-операция (insert_book_tags_from_source с несуществующим target)
    поднимет FK IntegrityError → 500. UX-fix общий — librarium-py-q6cu."""
    if target_id == source_id:
        raise BadInputError("Нельзя объединить с самим собой")
    if not dal.tag_exists(db, source_id):
        return False
    dal.merge_tag(db, target_id, source_id)
    return True


def delete_tag(db: sqlite3.Connection, tag_id: int) -> None:
    """Delete tag. Делегация в DAL — структурно симметрично delete_series/
    delete_author. DAL raise'ит NotFoundError/BadInputError (existence+count
    checks), пропагируем."""
    dal.delete_tag(db, tag_id)
