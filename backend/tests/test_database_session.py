import pytest
from concurrent.futures import ThreadPoolExecutor


def _close_session(session):
    try:
        next(session)
    except StopIteration:
        return


def test_overlapping_db_session_uses_distinct_connection_and_commit_hooks():
    from app.database import add_after_commit_hook, db_session

    calls: list[str] = []

    outer = db_session()
    db = next(outer)
    assert add_after_commit_hook(db, lambda: calls.append("outer"))

    inner = db_session()
    inner_db = next(inner)
    assert inner_db is not db
    assert add_after_commit_hook(inner_db, lambda: calls.append("inner"))

    _close_session(inner)
    assert calls == ["inner"]

    _close_session(outer)
    assert calls == ["inner", "outer"]


def test_overlapping_db_session_uses_distinct_connection_and_rollback_hooks():
    from app.database import add_after_rollback_hook, db_session

    calls: list[str] = []

    outer = db_session()
    db = next(outer)
    assert add_after_rollback_hook(db, lambda: calls.append("outer"))

    inner = db_session()
    inner_db = next(inner)
    assert inner_db is not db
    assert add_after_rollback_hook(inner_db, lambda: calls.append("inner"))

    _close_session(inner)
    assert calls == []

    with pytest.raises(RuntimeError):
        outer.throw(RuntimeError("boom"))

    assert calls == ["outer"]


def test_db_session_teardown_can_run_on_different_thread():
    from app.database import _get_db, add_after_commit_hook, db_session

    calls: list[str] = []

    session = db_session()
    db = next(session)
    assert add_after_commit_hook(db, lambda: calls.append("committed"))

    with ThreadPoolExecutor(max_workers=1) as executor:
        executor.submit(_close_session, session).result()

    assert calls == ["committed"]
    assert add_after_commit_hook(db, lambda: calls.append("stale")) is False

    next_session = db_session()
    next_db = next(next_session)
    assert next_db is db
    assert add_after_commit_hook(next_db, lambda: calls.append("next"))
    _close_session(next_session)

    assert _get_db() is db
    assert calls == ["committed", "next"]


def test_open_event_db_is_not_thread_local_session_connection(db):
    from app.database import open_event_db

    event_db = open_event_db()
    try:
        assert event_db is not db
        assert event_db.execute("SELECT 1").fetchone()[0] == 1
    finally:
        event_db.close()


def test_overlapping_cross_thread_teardown_does_not_leave_closed_db_in_local_state():
    from app.database import _get_db, add_after_commit_hook, db_session

    calls: list[str] = []

    outer = db_session()
    outer_db = next(outer)
    inner = db_session()
    inner_db = next(inner)
    assert inner_db is not outer_db

    with ThreadPoolExecutor(max_workers=1) as executor:
        executor.submit(_close_session, inner).result()
        executor.submit(_close_session, outer).result()

    assert add_after_commit_hook(inner_db, lambda: calls.append("stale")) is False

    next_session = db_session()
    next_db = next(next_session)
    assert next_db is outer_db
    assert add_after_commit_hook(next_db, lambda: calls.append("next"))
    _close_session(next_session)

    assert _get_db() is outer_db
    assert calls == ["next"]
