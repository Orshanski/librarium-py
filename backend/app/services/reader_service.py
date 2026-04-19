"""Reader device settings + reading progress."""
import sqlite3
import uuid

from ..dal import reader as dal
from ..dtos.reader import (
    ProgressAcceptedResponse, ProgressRejectedResponse,
    ProgressSaveResponse, ReadingProgressResponse, ReaderSettingsBody,
    ReadingProgressBody, ReaderSettingsGetResponse,
)


def get_or_create_device_id(cookie_value: str | None) -> str:
    """Resolve device id from cookie or generate a new one.

    Pure function — cookie write-back stays in router.
    """
    return cookie_value or str(uuid.uuid4())


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
) -> ProgressSaveResponse:
    result = dal.save_reading_progress(
        db, user_id, book_id,
        body.position, body.last_device, body.last_format, body.fraction, body.expected_version,
    )
    if result["accepted"]:
        return ProgressAcceptedResponse(
            accepted=True,
            version=result["version"],
            rebased=result.get("rebased", False),
        )
    return ProgressRejectedResponse(
        accepted=False,
        current=result.get("current"),
        retry_exhausted=result.get("retry_exhausted", False),
    )
