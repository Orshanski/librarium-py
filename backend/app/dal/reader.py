import json
import sqlite3
from datetime import datetime, timezone
from ..database import dict_from_row


def get_reader_settings(db: sqlite3.Connection, user_id: int, device_type: str) -> dict:
    row = db.execute(
        "SELECT settings FROM reader_settings WHERE user_id = :uid AND device_type = :dt",
        {"uid": user_id, "dt": device_type},
    ).fetchone()
    if not row:
        return {}
    return json.loads(row["settings"])


def save_reader_settings(db: sqlite3.Connection, user_id: int, device_type: str, settings: dict):
    db.execute("""
        INSERT INTO reader_settings (user_id, device_type, settings)
        VALUES (:uid, :dt, :s)
        ON CONFLICT(user_id, device_type) DO UPDATE SET settings = :s
    """, {"uid": user_id, "dt": device_type, "s": json.dumps(settings)})


def get_reading_progress(db: sqlite3.Connection, user_id: int, book_id: int) -> dict:
    row = db.execute(
        "SELECT position, last_device, last_format, fraction, last_read_at, version "
        "FROM reading_progress WHERE user_id = :uid AND book_id = :bid",
        {"uid": user_id, "bid": book_id},
    ).fetchone()
    if not row:
        return {
            "position": None,
            "last_device": None,
            "last_format": None,
            "fraction": None,
            "last_read_at": None,
            "version": 0,
        }
    return dict_from_row(row)


def save_reading_progress(
    db: sqlite3.Connection,
    user_id: int,
    book_id: int,
    position: str,
    last_device: str,
    last_format: str = "",
    fraction: float = 0,
    expected_version: int = 0,
) -> dict:
    """
    Version-based CAS save with intent-aware conflict resolution.

    Returns one of:
      {"accepted": True, "version": N, "rebased": bool}
      {"accepted": False, "current": {position, last_device, last_format,
                                       fraction, last_read_at, version}}
      {"accepted": False, "retry_exhausted": True, "current": None}

    CAS is enforced at the UPDATE level: every UPDATE includes
    `AND version = :expected` in its WHERE, and INSERT uses ON CONFLICT DO
    NOTHING. We verify cursor.rowcount to detect a lost race against another
    writer that committed between our SELECT and our write, and retry up to
    3 times before giving up. This matters because db_session uses one
    connection per thread in legacy autocommit mode — our SELECT holds no
    lock, so another threadpool worker can commit an UPDATE in between.
    """
    now = datetime.now(timezone.utc).isoformat()
    params_base = {
        "uid": user_id, "bid": book_id, "pos": position, "dev": last_device,
        "fmt": last_format, "frac": fraction, "now": now,
    }

    for _ in range(3):
        current = db.execute(
            "SELECT position, last_device, last_format, fraction, last_read_at, version "
            "FROM reading_progress WHERE user_id = :uid AND book_id = :bid",
            {"uid": user_id, "bid": book_id},
        ).fetchone()

        if current is None:
            # First write for (user, book). ON CONFLICT DO NOTHING so a
            # simultaneous first-write from another device does not raise
            # UNIQUE constraint failed — it just yields rowcount=0 and we
            # retry into the UPDATE branch.
            cursor = db.execute(
                "INSERT INTO reading_progress "
                "(user_id, book_id, position, last_device, last_format, fraction, last_read_at, version) "
                "VALUES (:uid, :bid, :pos, :dev, :fmt, :frac, :now, 1) "
                "ON CONFLICT(user_id, book_id) DO NOTHING",
                params_base,
            )
            if cursor.rowcount > 0:
                return {"accepted": True, "version": 1, "rebased": False}
            continue  # raced: a concurrent writer inserted the row — retry

        current_version = current["version"]
        current_fraction = current["fraction"] if current["fraction"] is not None else 0.0

        if current_version == expected_version:
            # Clean CAS match
            cursor = db.execute(
                "UPDATE reading_progress "
                "SET position = :pos, last_device = :dev, last_format = :fmt, "
                "    fraction = :frac, last_read_at = :now, version = version + 1 "
                "WHERE user_id = :uid AND book_id = :bid AND version = :ver",
                {**params_base, "ver": expected_version},
            )
            if cursor.rowcount > 0:
                return {"accepted": True, "version": expected_version + 1, "rebased": False}
            continue  # raced: version moved between SELECT and UPDATE — retry

        # Conflict: intent check
        if fraction >= current_fraction:
            # Forward (or equal) → auto-rebase (accept on top of current)
            cursor = db.execute(
                "UPDATE reading_progress "
                "SET position = :pos, last_device = :dev, last_format = :fmt, "
                "    fraction = :frac, last_read_at = :now, version = version + 1 "
                "WHERE user_id = :uid AND book_id = :bid AND version = :ver",
                {**params_base, "ver": current_version},
            )
            if cursor.rowcount > 0:
                return {"accepted": True, "version": current_version + 1, "rebased": True}
            continue  # raced: version moved — retry

        # Rewind in conflict → reject, return current state for client to adopt
        return {
            "accepted": False,
            "current": {
                "position": current["position"],
                "last_device": current["last_device"],
                "last_format": current["last_format"],
                "fraction": current["fraction"],
                "last_read_at": current["last_read_at"],
                "version": current_version,
            },
        }

    # 3 retries lost the race every time — should be effectively impossible
    # under SQLite WAL single-writer but we return a clean error instead of
    # silently corrupting state.
    return {"accepted": False, "retry_exhausted": True, "current": None}
