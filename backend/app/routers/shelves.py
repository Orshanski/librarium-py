from typing import Annotated, Any
import logging
import sqlite3

from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos import IdResponse, OkResponse
from ..dtos.catalog import UserSort
from ..dtos.shelves import ShelfBody, ShelfBookBody, ShelfDetailResponse, ShelvesListResponse
from ..events import EventScope, publish_domain_event_after_commit
from ..logging_utils import safe as safe_log
from ..services import book_service, shelves_service

log = logging.getLogger("librarium.shelves")
router = APIRouter(prefix="/api/shelves", tags=["shelves"])


@router.get("", response_model=ShelvesListResponse, response_model_exclude_none=True)  # exclude_none: book_shelves is None when bookId absent
def list_shelves(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    book_id: Annotated[int | None, Query(alias="bookId")] = None,
):
    return shelves_service.list_shelves(db, user.user_id, book_id)


@router.post("", response_model=IdResponse)
def create_shelf(body: ShelfBody, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    shelf_id = shelves_service.create_shelf(db, user.user_id, body.name)
    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="user", user_id=user.user_id),
        event_type="shelfCreated",
        payload={"shelfId": shelf_id, "name": body.name},
    )
    log.info("Created shelf=%s by user_id=%s", safe_log(body.name), user.user_id)
    return IdResponse(id=shelf_id)


@router.get("/{shelf_id}", response_model=ShelfDetailResponse, response_model_exclude_none=True)  # exclude_none: optional fields are endpoint-specific extras (rating, fraction, ...) absent for some shelf branches
def get_shelf(
    shelf_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
    sort: UserSort = "addedDesc",
):
    return shelves_service.get_shelf(db, shelf_id, user.user_id, sort)


@router.put("/{shelf_id}", response_model=OkResponse)
def update_shelf(shelf_id: int, body: ShelfBody, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    changed = shelves_service.update_shelf_changed(db, shelf_id, user.user_id, body.name)
    if changed:
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="user", user_id=user.user_id),
            event_type="shelfRenamed",
            payload={"shelfId": shelf_id, "name": body.name},
        )
    return OkResponse()


@router.delete("/{shelf_id}", response_model=OkResponse)
def delete_shelf(shelf_id: int, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    changed = shelves_service.delete_shelf_changed(db, shelf_id, user.user_id)
    if changed:
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="user", user_id=user.user_id),
            event_type="shelfDeleted",
            payload={"shelfId": shelf_id},
        )
    log.info("Deleted shelf=%d by user_id=%s", shelf_id, user.user_id)
    return OkResponse()


@router.post("/{shelf_id}/books", response_model=OkResponse)
def add_book(shelf_id: int, body: ShelfBookBody, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    changed = shelves_service.add_book_changed(db, shelf_id, user.user_id, body.book_id)
    if changed:
        payload: dict[str, Any] = {"shelfId": shelf_id, "bookId": body.book_id, "hasBook": True}
        card = book_service.get_book_card_item_or_none(db, body.book_id, user.user_id)
        if card is not None:
            payload["book"] = card.model_dump(by_alias=True)
        else:
            # Аномалия: changed=True означает что книга только что прошла add — карточка обязана быть.
            # Тихо опускаем поле, frontend откатится к инвалидации; пишем warning для мониторинга.
            # int()/str() — defense-in-depth для taint-tracker'а CodeQL (py/log-injection):
            # Pydantic уже валидирует shelf_id и body.book_id как int, но статанализ
            # не моделирует Pydantic-валидацию, поэтому явный cast обрывает taint-flow.
            log.warning(
                "shelfMembershipChanged add без карточки книги: shelf_id=%d book_id=%d user_id=%s",
                int(shelf_id), int(body.book_id), str(user.user_id),
            )
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="user", user_id=user.user_id),
            event_type="shelfMembershipChanged",
            payload=payload,
        )
    return OkResponse()


@router.delete("/{shelf_id}/books/{book_id}", response_model=OkResponse)
def remove_book(shelf_id: int, book_id: int, user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)]):
    changed = shelves_service.remove_book_changed(db, shelf_id, user.user_id, book_id)
    if changed:
        publish_domain_event_after_commit(
            db,
            scope=EventScope(kind="user", user_id=user.user_id),
            event_type="shelfMembershipChanged",
            payload={"shelfId": shelf_id, "bookId": book_id, "hasBook": False},
        )
    return OkResponse()
