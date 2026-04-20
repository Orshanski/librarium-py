import sqlite3
from pathlib import Path

import aiosql

queries = aiosql.from_path(Path(__file__).parent / "queries" / "settings", "sqlite3")


def get_setting(db: sqlite3.Connection, key: str) -> str | None:
    row = queries.get_setting(db, k=key)
    return row["value"] if row else None


def get_all_settings(db: sqlite3.Connection) -> dict[str, str | None]:
    """Return all settings as a key/value mapping. Stays `dict[str, str | None]`
    per spec whitelist — the settings table is a key/value bag, and `value` is
    a nullable TEXT column per schema. TypedDict would be a false contract."""
    rows = queries.get_all_settings(db)
    return {r["key"]: r["value"] for r in rows}


def set_setting(db: sqlite3.Connection, key: str, value: str | None) -> None:
    queries.upsert_setting(db, k=key, v=value)
