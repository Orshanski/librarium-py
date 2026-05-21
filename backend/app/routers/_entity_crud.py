"""
Explicit factory that registers up to 4 shared CRUD endpoints (3 when
`register_get=False`) shared between authors, series and tags on a
caller-provided APIRouter:
    GET    /{entity_id}    # only when register_get=True
    PUT    /{entity_id}
    POST   /{entity_id}/merge
    DELETE /{entity_id}

Plain function, not a decorator / not a metaclass / not a class-returning factory.
Callers own the router instance (prefix, tags, list endpoint). `list_*` is not
registered here because authors/series/tags differ in query-param signatures.

Dynamic naming: factory резолвит service-функции через `getattr` по
entity_label:
    get_<entity_label>(db, id, user_id)         # only when register_get=True
    rename_<entity_label>(db, id, name)
    merge_<entity_label>s(db, target, source)   # authors → merge_authors (plural)
        or merge_<entity_label>(db, target, source)   # series/tags → singular
    delete_<entity_label>(db, id)
    get_<entity_label>_name(db, id)             # required для re-read payload в *Renamed event'е

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
    register_get: bool = True,
) -> None:
    """Register up to 4 shared CRUD endpoints on ``router`` (3 when ``register_get=False``).

    Required service functions (всегда, независимо от ``register_get``):
      - ``rename_<label>(db, id, name) → bool``
      - ``merge_<label>s(db, target, source) → bool`` (plural for authors) or
        ``merge_<label>(db, target, source) → bool`` (series; singular=plural)
      - ``delete_<label>(db, id) → None``
      - ``get_<label>_name(db, id) → str`` — re-read из БД после успешного
        rename для unified payload события ``*Renamed``. Raises NotFoundError
        если запись пропала между rename и re-read.
      Service functions raise custom domain exceptions (NotFoundError,
      BadInputError) — middleware handles HTTP maps.

    Optional service functions (only when ``register_get=True``):
      - ``get_<label>(db, id, user_id)`` — takes a ``user_id`` because the
        detail page books[] carry per-user rating/is_read via LEFT JOIN with
        user_books.

    Parameters:
      - ``service``: entity service module (e.g. ``authors_service``).
      - ``logger``: caller's module logger for info lines on rename/merge/delete.
      - ``entity_label``: singular noun used in log lines (``"author"``, ``"series"``).
      - ``detail_response_model``: optional Pydantic model class for the GET
        /{entity_id} response_model annotation (L4 Response DTOs). When None,
        no annotation is added (backward compat for tests/routers that call
        the factory without a model).
      - ``register_get``: when False, GET /{entity_id} is not registered, and
        ``get_<entity_label>`` (the GET handler service-function) is not required.
        ``get_<entity_label>_name`` is still required (re-read for *Renamed
        payload). Used by tags router which has a custom filtered GET. Default
        True preserves existing authors/series behavior.
    """
    rename_fn = getattr(service, f"rename_{entity_label}")
    # authors → merge_authors (plural); series → merge_series (singular == plural).
    merge_fn = (
        getattr(service, f"merge_{entity_label}s", None)
        or getattr(service, f"merge_{entity_label}")
    )
    delete_fn = getattr(service, f"delete_{entity_label}")
    # `get_<entity_label>_name(db, id) → str` — required для всех call-sites
    # (используется для re-read stored name в payload события *Renamed,
    # независимо от register_get).
    get_name_fn = getattr(service, f"get_{entity_label}_name")

    if register_get:
        get_fn = getattr(service, f"get_{entity_label}")
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
        # body.name уже stripped Pydantic'ом (RenameBody → STRIP_BODY_CONFIG);
        # доп. .strip() не нужен.
        name = body.name
        changed = rename_fn(db, entity_id, name)
        if changed:
            # Re-read stored name from DB для unified event payload —
            # для tags `normalize_tag_name` приводит wire-input ("science
            # fiction") к stored ("Science fiction"); фабрика должна
            # публиковать stored, а не wire (иначе UI-flicker).
            stored_name = get_name_fn(db, entity_id)
            publish_domain_event_after_commit(
                db,
                scope=EventScope(kind="library"),
                event_type=f"{entity_label}Renamed",
                payload={_entity_id_payload_key(entity_label): entity_id, "name": stored_name},
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
