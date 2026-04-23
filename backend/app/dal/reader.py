import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypedDict, cast

import aiosql

from ..database import dict_from_row
from ..dtos.reader import ProgressSaveResult, ReadingProgressRow

queries = aiosql.from_path(Path(__file__).parent / "queries" / "reader", "sqlite3")


class _ProgressParams(TypedDict):
    uid: int
    bid: int
    pos: str
    dev: str
    fmt: str
    frac: float
    now: str


def get_reader_settings(db: sqlite3.Connection, user_id: int, device_type: str) -> dict[str, Any]:
    """Return opaque reader settings JSON blob. Stays dict[str, Any] per spec whitelist
    (client-controlled shape — not a typed record)."""
    row = queries.get_reader_settings(db, uid=user_id, dt=device_type)
    if not row:
        return {}
    return json.loads(row["settings"])


def save_reader_settings(db: sqlite3.Connection, user_id: int, device_type: str, settings: dict[str, Any]) -> None:
    queries.save_reader_settings(db, uid=user_id, dt=device_type, s=json.dumps(settings))


def get_reading_progress(db: sqlite3.Connection, user_id: int, book_id: int) -> ReadingProgressRow:
    row = queries.get_reading_progress(db, uid=user_id, bid=book_id)
    if not row:
        return ReadingProgressRow(
            position=None,
            last_device=None,
            last_format=None,
            fraction=None,
            last_read_at=None,
            version=0,
        )
    return cast(ReadingProgressRow, dict_from_row(row))


def _try_insert(db: sqlite3.Connection, params_base: _ProgressParams) -> ProgressSaveResult | None:
    """First write for (user, book). ON CONFLICT DO NOTHING so a
    simultaneous first-write from another device does not raise
    UNIQUE constraint failed — it just yields rowcount=0 and we
    retry into the UPDATE branch.
    Returns result on success, None on race (rowcount=0 after retry window — caller should retry)."""
    rowcount = queries.insert_reading_progress(db, **params_base)
    if rowcount > 0:
        return {"accepted": True, "version": 1, "rebased": False}
    return None


def _try_cas_update(
    db: sqlite3.Connection,
    params_base: _ProgressParams,
    expected_version: int,
) -> ProgressSaveResult | None:
    """Clean CAS match: UPDATE WHERE version=:expected.
    Returns result on success, None on race (rowcount=0 after retry window — caller should retry)."""
    rowcount = queries.update_reading_progress(db, **params_base, ver=expected_version)
    if rowcount > 0:
        return {"accepted": True, "version": expected_version + 1, "rebased": False}
    return None


def _try_rebase_update(
    db: sqlite3.Connection,
    params_base: _ProgressParams,
    current_version: int,
) -> ProgressSaveResult | None:
    """Forward (or equal) → auto-rebase (accept on top of current).
    Returns result on success, None on race (rowcount=0 after retry window — caller should retry)."""
    rowcount = queries.update_reading_progress(db, **params_base, ver=current_version)
    if rowcount > 0:
        return {"accepted": True, "version": current_version + 1, "rebased": True}
    return None


def _build_rejection(current: ReadingProgressRow) -> ProgressSaveResult:
    """Rewind in conflict → reject, return current state for client to adopt."""
    return {
        "accepted": False,
        "current": {
            "position": current["position"],
            "last_device": current["last_device"],
            "last_format": current["last_format"],
            "fraction": current["fraction"],
            "last_read_at": current["last_read_at"],
            "version": current["version"],
        },
    }


def save_reading_progress(
    db: sqlite3.Connection,
    user_id: int,
    book_id: int,
    position: str,
    last_device: str,
    last_format: str = "",
    fraction: float = 0,
    expected_version: int = 0,
) -> ProgressSaveResult:
    """
    Version-based CAS save with intent-aware conflict resolution.

    Returns one of:
      {"accepted": True, "version": N, "rebased": bool}
      {"accepted": False, "current": {position, last_device, last_format,
                                       fraction, last_read_at, version}}
      {"accepted": False, "retry_exhausted": True, "current": None}

    При `current is None` (первая запись) `expected_version` игнорируется — INSERT
    создаёт строку с v=1 независимо от клиентского ожидания.

    CAS is enforced at the UPDATE level: every UPDATE includes
    `AND version = :expected` in its WHERE, and INSERT uses ON CONFLICT DO
    NOTHING. We verify cursor.rowcount to detect a lost race against another
    writer that committed between our SELECT and our write, and retry up to
    3 times before giving up. This matters because db_session uses one
    connection per thread in legacy autocommit mode — our SELECT holds no
    lock, so another threadpool worker can commit an UPDATE in between.
    """
    now = datetime.now(timezone.utc).isoformat()
    params_base: _ProgressParams = {
        "uid": user_id, "bid": book_id, "pos": position, "dev": last_device,
        "fmt": last_format, "frac": fraction, "now": now,
    }

    for _ in range(3):
        current = queries.get_reading_progress(db, uid=user_id, bid=book_id)

        if current is None:
            if result := _try_insert(db, params_base):
                return result
            continue  # raced: a concurrent writer inserted the row — retry

        current_version = current["version"]
        current_fraction = current["fraction"] if current["fraction"] is not None else 0.0

        if current_version == expected_version:
            if result := _try_cas_update(db, params_base, expected_version):
                return result
            continue  # raced: version moved between SELECT and UPDATE — retry

        if fraction >= current_fraction:
            if result := _try_rebase_update(db, params_base, current_version):
                return result
            continue  # raced: version moved — retry

        # Rewind in conflict → reject without retry
        return _build_rejection(current)

    # 3 retries lost the race every time — should be effectively impossible
    # under SQLite WAL single-writer but we return a clean error instead of
    # silently corrupting state.
    return {"accepted": False, "retry_exhausted": True, "current": None}
