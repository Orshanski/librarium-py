"""
Explicit factory that registers the 4 shared CRUD endpoints shared between
authors and series on a caller-provided APIRouter:
    GET    /{entity_id}
    PUT    /{entity_id}
    POST   /{entity_id}/merge
    DELETE /{entity_id}

Plain function, not a decorator / not a metaclass / not a class-returning factory.
Callers own the router instance (prefix, tags, list endpoint). `list_*` is not
registered here because authors and series differ in query-param signatures.

Dynamic naming: factory резолвит service-функции через `getattr` по
entity_label:
    get_<entity_label>(db, id)
    rename_<entity_label>(db, id, name)
    merge_<entity_label>s(db, target, source)  # authors → merge_authors (plural)
        or merge_<entity_label>(db, target, source)  # series → merge_series
    delete_<entity_label>(db, id)

Detail-строки (not-found, has-books, self-merge) — inside service functions,
не kwargs фабрики.
"""
import logging
import sqlite3
from types import ModuleType
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import get_current_user, require_admin
from ..database import db_session


class _RenameBody(BaseModel):
    name: str


class _MergeBody(BaseModel):
    sourceId: int


def register_entity_crud(
    router: APIRouter,
    *,
    service: ModuleType,
    logger: logging.Logger,
    entity_label: str,
) -> None:
    """Register 4 shared CRUD endpoints on ``router``.

    Parameters:
      - ``service``: entity service module (e.g. ``authors_service``). Must expose
        ``get_<label>(db, id)``, ``rename_<label>(db, id, name)``,
        ``merge_<label>s(db, target, source)`` (plural for authors) or
        ``merge_<label>(db, target, source)`` (series; singular=plural),
        ``delete_<label>(db, id)``. Service functions raise custom domain
        exceptions (NotFoundError, BadInputError) — middleware handles HTTP maps.
      - ``logger``: caller's module logger for info lines on rename/merge/delete.
      - ``entity_label``: singular noun used in log lines (``"author"``, ``"series"``).
    """
    get_fn = getattr(service, f"get_{entity_label}")
    rename_fn = getattr(service, f"rename_{entity_label}")
    # authors → merge_authors (plural); series → merge_series (singular == plural).
    merge_fn = (
        getattr(service, f"merge_{entity_label}s", None)
        or getattr(service, f"merge_{entity_label}")
    )
    delete_fn = getattr(service, f"delete_{entity_label}")

    @router.get("/{entity_id}")
    def get_entity(
        entity_id: int,
        user: dict = Depends(get_current_user),
        db: sqlite3.Connection = Depends(db_session),
    ):
        return get_fn(db, entity_id)

    @router.put("/{entity_id}")
    def rename_entity(
        entity_id: int,
        body: _RenameBody,
        user: dict = Depends(require_admin),
        db: sqlite3.Connection = Depends(db_session),
    ):
        name = body.name.strip()
        rename_fn(db, entity_id, name)
        logger.info(
            "Renamed %s=%d to=%s by user_id=%s",
            entity_label, entity_id, name, user["userId"],
        )
        return {"ok": True}

    @router.post("/{entity_id}/merge")
    def merge_entity(
        entity_id: int,
        body: _MergeBody,
        user: dict = Depends(require_admin),
        db: sqlite3.Connection = Depends(db_session),
    ):
        merge_fn(db, entity_id, body.sourceId)
        logger.info(
            "Merged %s source=%d into target=%d by user_id=%s",
            entity_label, body.sourceId, entity_id, user["userId"],
        )
        return {"ok": True}

    @router.delete("/{entity_id}")
    def delete_entity(
        entity_id: int,
        user: dict = Depends(require_admin),
        db: sqlite3.Connection = Depends(db_session),
    ):
        delete_fn(db, entity_id)
        logger.info("Deleted %s=%d by user_id=%s", entity_label, entity_id, user["userId"])
        return {"ok": True}
