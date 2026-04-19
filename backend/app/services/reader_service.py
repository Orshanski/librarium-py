"""Reader device settings + reading progress."""
import sqlite3
import uuid
from typing import Any

from ..dal import reader as dal
from ..dtos.reader import ReaderSettingsBody


def get_or_create_device_id(cookie_value: str | None) -> str:
    """Resolve device id from cookie or generate a new one.

    Pure function — cookie write-back stays in router.
    """
    return cookie_value or str(uuid.uuid4())


def get_settings(db: sqlite3.Connection, user_id: int, device_id: str) -> dict[str, Any]:
    return dal.get_reader_settings(db, user_id, device_id)


def save_settings(db: sqlite3.Connection, user_id: int, device_id: str, body: ReaderSettingsBody) -> None:
    # Body is typed at the router/service boundary; the settings blob
    # itself stays dict[str, Any] all the way to DAL (opaque JSON,
    # see spec Non-goals).
    dal.save_reader_settings(db, user_id, device_id, body.settings)


def get_progress(db: sqlite3.Connection, user_id: int, book_id: int) -> dict:
    return dal.get_reading_progress(db, user_id, book_id)


def save_progress(
    db: sqlite3.Connection,
    user_id: int,
    book_id: int,
    position: str,
    last_device: str,
    last_format: str = "",
    fraction: float = 0,
    expected_version: int = 0,
) -> dict:
    return dal.save_reading_progress(
        db, user_id, book_id, position, last_device, last_format, fraction, expected_version,
    )
