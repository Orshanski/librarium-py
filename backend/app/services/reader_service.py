"""Reader device settings + reading progress."""
import sqlite3
import uuid
from typing import Any

from ..dal.reader import (
    get_reader_settings as _dal_get_settings,
    save_reader_settings as _dal_save_settings,
    get_reading_progress as _dal_get_progress,
    save_reading_progress as _dal_save_progress,
)


def get_or_create_device_id(cookie_value: str | None) -> str:
    """Resolve device id from cookie or generate a new one.

    Pure function — cookie write-back stays in router.
    """
    return cookie_value or str(uuid.uuid4())


def get_settings(db: sqlite3.Connection, user_id: int, device_id: str) -> dict[str, Any]:
    return _dal_get_settings(db, user_id, device_id)


def save_settings(db: sqlite3.Connection, user_id: int, device_id: str, settings: dict[str, Any]) -> None:
    _dal_save_settings(db, user_id, device_id, settings)


def get_progress(db: sqlite3.Connection, user_id: int, book_id: int):
    return _dal_get_progress(db, user_id, book_id)


def save_progress(db: sqlite3.Connection, user_id: int, book_id: int,
                  position: str, last_device: str, last_format: str,
                  fraction: float, expected_version: int):
    return _dal_save_progress(
        db, user_id, book_id, position, last_device, last_format, fraction, expected_version,
    )
