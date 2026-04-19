"""Service-layer для tags: raise NotFoundError на отсутствующие теги."""
import sqlite3

from ..dal import tags as dal
from ..dtos.entities import TagCloudResponse, TagDetailResponse, TagMapResult
from ..exceptions import NotFoundError


def tag_cloud(db: sqlite3.Connection, top: int | None) -> TagCloudResponse:
    return TagCloudResponse(tags=dal.get_tag_cloud(db, top))


def get_tag(
    db: sqlite3.Connection,
    tag_id: int,
    author_ids: list[int],
    series_ids: list[int],
    language: str | None,
) -> TagDetailResponse:
    result = dal.get_tag_by_id(db, tag_id, author_ids, series_ids, language)
    if not result:
        raise NotFoundError("Not found")
    return TagDetailResponse(tag=result["tag"], books=result["books"])


def map_tag(db: sqlite3.Connection, tag_id: int, name: str) -> TagMapResult:
    """Renames tag to `name`, или merges в existing tag с таким именем.
    Raises NotFoundError если tag_id не существует.
    Returns TagMapResult TypedDict with renamed flag and resolved target_id.
    The router builds the wire response (TagMapResponse) and uses renamed for logging."""
    if not dal.tag_exists(db, tag_id):
        raise NotFoundError("Not found")
    return dal.map_tag(db, tag_id, name)
