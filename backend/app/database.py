import sqlite3
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .config import DB_PATH, SCHEMA_PATH

_local = threading.local()
_schema_initialized = False
_init_lock = threading.Lock()

_AfterCommitHook = Callable[[], None]


@dataclass
class _SessionHooks:
    db: sqlite3.Connection
    restore_db: sqlite3.Connection | None
    restore_hooks: "_SessionHooks | None"
    isolated_connection: bool
    after_commit: list[_AfterCommitHook] = field(default_factory=list)
    after_rollback: list[_AfterCommitHook] = field(default_factory=list)
    closed: bool = False


def _open_db() -> sqlite3.Connection:
    global _schema_initialized
    db = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    _configure_db(db)

    with _init_lock:
        if not _schema_initialized:
            schema = Path(SCHEMA_PATH).read_text(encoding="utf-8")
            db.executescript(schema)
            _schema_initialized = True
    return db


def _configure_db(db: sqlite3.Connection) -> sqlite3.Connection:
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    db.create_function("lower_utf8", 1, lambda s: s.lower() if isinstance(s, str) else s)
    return db


def open_event_db() -> sqlite3.Connection:
    """Open a dedicated event-log connection without thread-local state or DDL."""
    db = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    return _configure_db(db)


def _get_db() -> sqlite3.Connection:
    _discard_closed_session_state()
    db = getattr(_local, "db", None)
    if db is None:
        db = _open_db()
        _local.db = db
    return db


def _discard_closed_session_state() -> None:
    while True:
        hooks = getattr(_local, "session_hooks", None)
        if hooks is None or not hooks.closed:
            return
        if getattr(_local, "db", None) is hooks.db:
            _local.db = hooks.restore_db
        _local.session_hooks = hooks.restore_hooks


def db_session():
    """FastAPI dependency: commit on success, rollback on error.

    FastAPI may close sync generator dependencies on a different worker thread
    than the one that opened them, so teardown uses hook lists captured in this
    generator frame instead of reading them back from thread-local storage.
    """
    _discard_closed_session_state()
    previous_hooks = getattr(_local, "session_hooks", None)
    isolated_connection = previous_hooks is not None
    if isolated_connection:
        previous_db = getattr(_local, "db", None)
        db = _open_db()
        restore_db = previous_db
    else:
        db = _get_db()
        restore_db = db
    hooks = _SessionHooks(db, restore_db, previous_hooks, isolated_connection)
    _local.db = db
    _local.session_hooks = hooks

    try:
        yield db
        if db.in_transaction:
            db.commit()
        for hook in hooks.after_commit:
            hook()
    except Exception:
        if db.in_transaction:
            db.rollback()
        for hook in hooks.after_rollback:
            hook()
        raise
    finally:
        hooks.closed = True
        if isolated_connection:
            db.close()
        if getattr(_local, "session_hooks", None) is hooks:
            _local.db = restore_db
            _local.session_hooks = previous_hooks


def add_after_commit_hook(db: sqlite3.Connection, hook: _AfterCommitHook) -> bool:
    """Register a callback to run after the current managed db_session commits.

    Returns False when called outside the db_session that owns `db`; callers can
    then fall back to immediate behavior for scripts or direct test helpers.
    """
    _discard_closed_session_state()
    hooks = getattr(_local, "session_hooks", None)
    if hooks is None or hooks.closed or hooks.db is not db:
        return False
    hooks.after_commit.append(hook)
    return True


def add_after_rollback_hook(db: sqlite3.Connection, hook: _AfterCommitHook) -> bool:
    """Register a callback to run after the current managed db_session rolls back."""
    _discard_closed_session_state()
    hooks = getattr(_local, "session_hooks", None)
    if hooks is None or hooks.closed or hooks.db is not db:
        return False
    hooks.after_rollback.append(hook)
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
    _local.session_hooks = None
    _schema_initialized = False
