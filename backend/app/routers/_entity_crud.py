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
    get_<entity_label>(db, id, user_id)
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
from typing import Any, Annotated
from fastapi import APIRouter, Depends

from ..auth import CurrentUser, get_current_user, require_admin
from ..database import db_session
from ..dtos import OkResponse
from ..dtos.entities import RenameBody, MergeBody
from ..events import EventScope, publish_domain_event_after_commit


def _entity_id_payload_key(entity_label: str) -> str:
    return "seriesId" if entity_label == "series" else f"{entity_label}Id"


def register_entity_crud(
    router: APIRouter,
    *,
    service: ModuleType,
    logger: logging.Logger,
    entity_label: str,
    detail_response_model: type[Any] | None = None,
) -> None:
    """Register 4 shared CRUD endpoints on ``router``.

    Parameters:
      - ``service``: entity service module (e.g. ``authors_service``). Must expose
        ``get_<label>(db, id, user_id)``, ``rename_<label>(db, id, name)``,
        ``merge_<label>s(db, target, source)`` (plural for authors) or
        ``merge_<label>(db, target, source)`` (series; singular=plural),
        ``delete_<label>(db, id)``. Service functions raise custom domain
        exceptions (NotFoundError, BadInputError) — middleware handles HTTP maps.
        ``get_<label>`` takes a ``user_id`` because the detail page books[] carry
        per-user rating/is_read via LEFT JOIN with user_books.
      - ``logger``: caller's module logger for info lines on rename/merge/delete.
      - ``entity_label``: singular noun used in log lines (``"author"``, ``"series"``).
      - ``detail_response_model``: optional Pydantic model class for the GET
        /{entity_id} response_model annotation (L4 Response DTOs). When None,
        no annotation is added (backward compat for tests/routers that call
        the factory without a model).
    """
    get_fn = getattr(service, f"get_{entity_label}")
    rename_fn = getattr(service, f"rename_{entity_label}")
    # authors → merge_authors (plural); series → merge_series (singular == plural).
    merge_fn = (
        getattr(service, f"merge_{entity_label}s", None)
        or getattr(service, f"merge_{entity_label}")
    )
    delete_fn = getattr(service, f"delete_{entity_label}")

    get_kwargs: dict[str, Any] = {}
    if detail_response_model is not None:
        get_kwargs["response_model"] = detail_response_model

    @router.get("/{entity_id}", **get_kwargs)
    def get_entity(
        entity_id: int,
        user: Annotated[CurrentUser, Depends(get_current_user)],
        db: Annotated[sqlite3.Connection, Depends(db_session)],
    ):
        return get_fn(db, entity_id, user.user_id)

    @router.put("/{entity_id}", response_model=OkResponse)
    def rename_entity(
        entity_id: int,
        body: RenameBody,
        user: Annotated[CurrentUser, Depends(require_admin)],
        db: Annotated[sqlite3.Connection, Depends(db_session)],
    ):
        name = body.name.strip()
        changed = rename_fn(db, entity_id, name)
        if changed:
            publish_domain_event_after_commit(
                db,
                scope=EventScope(kind="library"),
                event_type=f"{entity_label}Renamed",
                payload={_entity_id_payload_key(entity_label): entity_id, "name": name},
            )
        logger.info(
            "Renamed %s=%d to=%s by user_id=%s",
            entity_label, entity_id, name, user.user_id,
        )
        return OkResponse()

    @router.post("/{entity_id}/merge", response_model=OkResponse)
    def merge_entity(
        entity_id: int,
        body: MergeBody,
        user: Annotated[CurrentUser, Depends(require_admin)],
        db: Annotated[sqlite3.Connection, Depends(db_session)],
    ):
        changed = merge_fn(db, entity_id, body.source_id)
        if changed:
            publish_domain_event_after_commit(
                db,
                scope=EventScope(kind="library"),
                event_type=f"{entity_label}Merged",
                payload={"targetId": entity_id, "sourceId": body.source_id},
            )
        logger.info(
            "Merged %s source=%d into target=%d by user_id=%s",
            entity_label, body.source_id, entity_id, user.user_id,
        )
        return OkResponse()

    @router.delete("/{entity_id}", response_model=OkResponse)
    def delete_entity(
        entity_id: int,
        user: Annotated[CurrentUser, Depends(require_admin)],
        db: Annotated[sqlite3.Connection, Depends(db_session)],
    ):
        delete_fn(db, entity_id)
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="library"),
            event_type=f"{entity_label}Deleted",
            payload={_entity_id_payload_key(entity_label): entity_id},
        )
        logger.info("Deleted %s=%d by user_id=%s", entity_label, entity_id, user.user_id)
        return OkResponse()
