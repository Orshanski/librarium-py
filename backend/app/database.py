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


def rollback_if_dirty():
    """Rollback any uncommitted transaction on the current thread's connection."""
    db = getattr(_local, "db", None)
    if db is not None and db.in_transaction:
        db.rollback()


def db_session():
    """FastAPI dependency: ensures clean transaction state per request.

    Runs on the same threadpool thread as sync handlers, so it correctly
    accesses the thread-local connection — unlike the async middleware.
    """
    db = get_db()
    try:
        yield db
    finally:
        if db.in_transaction:
            db.rollback()


def dict_from_row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return dict(row)


def dicts_from_rows(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]


def reset_db():
    """Сбросить состояние для тестов — закрыть соединение, пересоздать схему."""
    global _schema_initialized
    db = getattr(_local, "db", None)
    if db:
        db.close()
        _local.db = None
    _schema_initialized = False
