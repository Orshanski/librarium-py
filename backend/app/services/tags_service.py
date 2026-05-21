"""Service-layer для tags: raise NotFoundError на отсутствующие теги."""
import sqlite3

from ..dal import tags as dal
from ..dtos.catalog import UserSort
from ..dtos.entities import TagCloudResponse, TagDetailResponse, TagMapResponse, TagSummary
from ..exceptions import NotFoundError
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
        ),
        books=books,
    )


def map_tag(db: sqlite3.Connection, tag_id: int, name: str) -> TagMapResponse:
    """Renames tag to `name`, или merges в existing tag с таким именем.
    Raises NotFoundError если tag_id не существует.
    Returns TagMapResponse; `renamed` is excluded from wire output but available
    as an attribute for router-side logging."""
    if not dal.tag_exists(db, tag_id):
        raise NotFoundError("Not found")
    normalized_name = dal.normalize_tag_name(name)
    if dal.get_tag_name(db, tag_id) == normalized_name:
        return TagMapResponse(ok=True, target_id=tag_id, renamed=True, changed=False, name=normalized_name)
    result = dal.map_tag(db, tag_id, name)
    committed_name = dal.get_tag_name(db, result["target_id"]) or normalized_name
    return TagMapResponse(
        ok=True,
        target_id=result["target_id"],
        renamed=result["renamed"],
        name=committed_name,
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
