import json
from datetime import datetime, timezone
from ..database import get_db, dict_from_row


def get_reader_settings(user_id: int, device_type: str) -> dict:
    db = get_db()
    row = db.execute(
        "SELECT settings FROM reader_settings WHERE user_id = :uid AND device_type = :dt",
        {"uid": user_id, "dt": device_type},
    ).fetchone()
    if not row:
        return {}
    return json.loads(row["settings"])


def save_reader_settings(user_id: int, device_type: str, settings: dict):
    db = get_db()
    db.execute("""
        INSERT INTO reader_settings (user_id, device_type, settings)
        VALUES (:uid, :dt, :s)
        ON CONFLICT(user_id, device_type) DO UPDATE SET settings = :s
    """, {"uid": user_id, "dt": device_type, "s": json.dumps(settings)})
    db.commit()


def get_reading_progress(user_id: int, book_id: int) -> dict:
    db = get_db()
    row = db.execute(
        "SELECT position, last_device, last_read_at FROM reading_progress WHERE user_id = :uid AND book_id = :bid",
        {"uid": user_id, "bid": book_id},
    ).fetchone()
    if not row:
        return {"position": None, "last_device": None, "last_read_at": None}
    return dict_from_row(row)


def save_reading_progress(user_id: int, book_id: int, position: str, last_device: str):
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    db.execute("""
        INSERT INTO reading_progress (user_id, book_id, position, last_device, last_read_at)
        VALUES (:uid, :bid, :pos, :dev, :now)
        ON CONFLICT(user_id, book_id) DO UPDATE SET
            position = :pos, last_device = :dev, last_read_at = :now
    """, {"uid": user_id, "bid": book_id, "pos": position, "dev": last_device, "now": now})
    db.commit()
