import sqlite3


def get_setting(db: sqlite3.Connection, key: str) -> str | None:
    row = db.execute("SELECT value FROM settings WHERE key = :k", {"k": key}).fetchone()
    return row["value"] if row else None


def set_setting(db: sqlite3.Connection, key: str, value: str | None):
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (:k, :v)", {"k": key, "v": value})


def get_all_settings(db: sqlite3.Connection) -> dict:
    rows = db.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}
