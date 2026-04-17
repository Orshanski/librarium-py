"""
Explicit factory that registers the 4 shared CRUD endpoints shared between
authors and series on a caller-provided APIRouter:
    GET    /{entity_id}
    PUT    /{entity_id}
    POST   /{entity_id}/merge
    DELETE /{entity_id}

Plain function, not a decorator / not a metaclass / not a class-returning factory.
Callers still own the router instance (prefix, tags, list endpoint). `list_*` is
not registered here because authors and series differ in query-param signatures.
"""
import logging
import sqlite3
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import get_current_user, require_admin
from ..database import db_session
from ._helpers import require_exists, raise_delete_error, guard_self_merge


class _RenameBody(BaseModel):
    name: str


class _MergeBody(BaseModel):
    sourceId: int


def register_entity_crud(
    router: APIRouter,
    *,
    dal,
    logger: logging.Logger,
    entity_label: str,
    detail_not_found: str,
    detail_has_books: str,
    detail_self_merge: str,
) -> None:
    """Register GET/{entity_id}, PUT/{entity_id}, POST/{entity_id}/merge,
    DELETE/{entity_id} on ``router``.

    Parameters:
      - ``dal``: the entity DAL module. Must expose
        ``get_<entity>_by_id(db, id)``, ``rename_<entity>(db, id, name)``,
        ``merge_<entity>s(db, target, source)`` or
        ``merge_<entity>(db, target, source)``, and
        ``delete_<entity>(db, id)``.
        The factory resolves those names via ``getattr``; for merge it tries
        the plural form first (``merge_<entity>s``), then falls back to the
        bare form (``merge_<entity>``).
      - ``logger``: the caller's module logger (used for ``info`` lines on
        rename/merge/delete success).
      - ``entity_label``: short noun used in log lines (e.g. ``"author"``,
        ``"series"``).
      - ``detail_not_found`` / ``detail_has_books`` / ``detail_self_merge``:
        Russian user-facing strings for error responses (unchanged by E3).
    """
    # Resolve DAL functions once at registration time; hard-fail on startup if
    # any name is missing from the DAL module.
    get_by_id = getattr(dal, f"get_{entity_label}_by_id")
    rename = getattr(dal, f"rename_{entity_label}")
    # Authors: merge_authors (plural); series: merge_series (singular==plural).
    merge = getattr(dal, f"merge_{entity_label}s", None) or getattr(dal, f"merge_{entity_label}")
    delete = getattr(dal, f"delete_{entity_label}")

    @router.get("/{entity_id}")
    def get_entity(entity_id: int, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
        result = get_by_id(db, entity_id)
        require_exists(result)
        return result

    @router.put("/{entity_id}")
    def rename_entity(entity_id: int, body: _RenameBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
        rename(db, entity_id, body.name.strip())
        logger.info("Renamed %s=%d to=%s by user_id=%s", entity_label, entity_id, body.name.strip(), user["userId"])
        return {"ok": True}

    @router.post("/{entity_id}/merge")
    def merge_entity(entity_id: int, body: _MergeBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
        guard_self_merge(entity_id, body.sourceId, detail=detail_self_merge)
        merge(db, entity_id, body.sourceId)
        logger.info("Merged %s source=%d into target=%d by user_id=%s", entity_label, body.sourceId, entity_id, user["userId"])
        return {"ok": True}

    @router.delete("/{entity_id}")
    def delete_entity(entity_id: int, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
        err = delete(db, entity_id)
        raise_delete_error(err, not_found_detail=detail_not_found, has_books_detail=detail_has_books)
        logger.info("Deleted %s=%d by user_id=%s", entity_label, entity_id, user["userId"])
        return {"ok": True}
