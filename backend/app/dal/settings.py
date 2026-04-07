from ..database import get_db


def get_setting(key: str) -> str | None:
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE key = :k", {"k": key}).fetchone()
    return row["value"] if row else None


def set_setting(key: str, value: str | None):
    db = get_db()
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (:k, :v)", {"k": key, "v": value})


def get_all_settings() -> dict:
    db = get_db()
    rows = db.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}
