import sqlite3
from pathlib import Path

from .config import DB_PATH, SCHEMA_PATH

_db: sqlite3.Connection | None = None


def get_db() -> sqlite3.Connection:
    global _db
    if _db is None:
        _db = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _db.row_factory = sqlite3.Row
        _db.execute("PRAGMA journal_mode=WAL")
        _db.execute("PRAGMA foreign_keys=ON")

        # UTF-8 lowercase for case-insensitive Cyrillic search
        _db.create_function("lower_utf8", 1, lambda s: s.lower() if isinstance(s, str) else s)

        # Initialize schema
        schema = Path(SCHEMA_PATH).read_text(encoding="utf-8")
        _db.executescript(schema)

    return _db


def dict_from_row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return dict(row)


def dicts_from_rows(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]
