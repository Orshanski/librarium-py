import sqlite3
import threading
from pathlib import Path
from typing import Callable

from .config import DB_PATH, SCHEMA_PATH

_local = threading.local()
_schema_initialized = False
_init_lock = threading.Lock()

_AfterCommitHook = Callable[[], None]


def _get_db() -> sqlite3.Connection:
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


def db_session():
    """FastAPI dependency: commit on success, rollback on error.

    Runs on the same threadpool thread as sync handlers, so it correctly
    accesses the thread-local connection — unlike the async middleware.
    """
    db = _get_db()
    previous_hooks = getattr(_local, "after_commit_hooks", None)
    _local.after_commit_hooks = []
    try:
        yield db
        if db.in_transaction:
            db.commit()
        for hook in _local.after_commit_hooks:
            hook()
    except Exception:
        if db.in_transaction:
            db.rollback()
        raise
    finally:
        _local.after_commit_hooks = previous_hooks


def add_after_commit_hook(db: sqlite3.Connection, hook: _AfterCommitHook) -> bool:
    """Register a callback to run after the current managed db_session commits.

    Returns False when called outside the db_session that owns `db`; callers can
    then fall back to immediate behavior for scripts or direct test helpers.
    """
    hooks = getattr(_local, "after_commit_hooks", None)
    if hooks is None or getattr(_local, "db", None) is not db:
        return False
    hooks.append(hook)
    return True


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
