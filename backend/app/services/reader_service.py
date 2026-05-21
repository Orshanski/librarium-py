"""Reader device settings + reading progress."""
import sqlite3
import uuid
from dataclasses import dataclass

from ..dal import reader as dal
from ..dal.books import book_exists
from ..dtos.reader import (
    ProgressAcceptedResponse, ProgressRejectedResponse,
    ProgressSaveResponse, ReadingProgressResponse, ReaderSettingsBody,
    ReadingProgressBody, ReaderSettingsGetResponse,
)
from ..exceptions import NotFoundError


@dataclass(frozen=True)
class ProgressSaveEventResult:
    response: ProgressSaveResponse
    event_payload: dict[str, object] | None


def get_or_create_device_id(cookie_value: str | None) -> str:
    """Resolve device id from cookie or generate a new one.

    Pure function — cookie write-back stays in router. Cookie value is
    validated as UUID before reuse: any non-UUID payload (attacker-supplied
    garbage, accidental truncation, header-injection sequences) is rejected
    and replaced with a fresh device id.
    """
    if cookie_value:
        try:
            uuid.UUID(cookie_value)
            return cookie_value
        except (ValueError, AttributeError):
            pass
    return str(uuid.uuid4())


def get_settings(db: sqlite3.Connection, user_id: int, device_id: str) -> ReaderSettingsGetResponse:
    return ReaderSettingsGetResponse(settings=dal.get_reader_settings(db, user_id, device_id))


def save_settings(db: sqlite3.Connection, user_id: int, device_id: str, body: ReaderSettingsBody) -> None:
    # Body is typed at the router/service boundary; the settings blob
    # itself stays dict[str, Any] all the way to DAL (opaque JSON,
    # see spec Non-goals).
    dal.save_reader_settings(db, user_id, device_id, body.settings)


def get_progress(db: sqlite3.Connection, user_id: int, book_id: int) -> ReadingProgressResponse:
    row = dal.get_reading_progress(db, user_id, book_id)
    return ReadingProgressResponse(
        position=row["position"],
        last_device=row["last_device"],
        last_format=row["last_format"],
        fraction=row["fraction"],
        last_read_at=row["last_read_at"],
        version=row["version"],
    )


def save_progress(
    db: sqlite3.Connection,
    user_id: int,
    book_id: int,
    body: ReadingProgressBody,
) -> ProgressSaveEventResult:
    # Stale tail из IDB: PWA пушит progress для давно удалённой книги.
    # Без проверки INSERT упадёт FK IntegrityError → 500. Возвращаем 404,
    # чтобы клиент мог вычистить хвост из локальной очереди.
    if not book_exists(db, book_id):
        raise NotFoundError("Book not found")
    previous = dal.get_reading_progress(db, user_id, book_id)
    result = dal.save_reading_progress(
        db, user_id, book_id,
        body.position, body.last_device, body.last_format, body.fraction, body.expected_version,
    )
    if result["accepted"]:
        current = dal.get_reading_progress(db, user_id, book_id)
        response = ProgressAcceptedResponse(
            accepted=True,
            version=result["version"],  # pyright: ignore[reportTypedDictNotRequiredAccess]
            rebased=result.get("rebased", False),
        )
        return ProgressSaveEventResult(
            response=response,
            event_payload={
                "bookId": book_id,
                "hadPosition": bool(previous["position"]),
                "hasPosition": bool(body.position),
                "lastReadAtChanged": previous["last_read_at"] != current["last_read_at"],
            },
        )
    response = ProgressRejectedResponse(
        accepted=False,
        current=result.get("current"),
        retry_exhausted=result.get("retry_exhausted", False),
    )
    return ProgressSaveEventResult(response=response, event_payload=None)
