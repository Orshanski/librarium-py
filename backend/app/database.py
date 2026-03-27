import sqlite3
import threading
from pathlib import Path

from .config import DB_PATH, SCHEMA_PATH

_local = threading.local()
_schema_initialized = False
_init_lock = threading.Lock()


def get_db() -> sqlite3.Connection:
    global _schema_initialized
    db = getattr(_local, "db", None)
    if db is None:
        db = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
        db.create_function("lower_utf8", 1, lambda s: s.lower() if isinstance(s, str) else s)

        with _init_lock:
            if not _schema_initialized:
                schema = Path(SCHEMA_PATH).read_text(encoding="utf-8")
                db.executescript(schema)
                _schema_initialized = True

        _local.db = db
    return db


def dict_from_row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return dict(row)


def dicts_from_rows(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]
