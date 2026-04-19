import sqlite3


def get_setting(db: sqlite3.Connection, key: str) -> str | None:
    row = db.execute("SELECT value FROM settings WHERE key = :k", {"k": key}).fetchone()
    return row["value"] if row else None


def set_setting(db: sqlite3.Connection, key: str, value: str | None) -> None:
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (:k, :v)", {"k": key, "v": value})


def get_all_settings(db: sqlite3.Connection) -> dict[str, str | None]:
    """Return all settings as a key/value mapping. Stays `dict[str, str | None]`
    per spec whitelist — the settings table is a key/value bag, and `value` is
    a nullable TEXT column per schema. TypedDict would be a false contract."""
    rows = db.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}
