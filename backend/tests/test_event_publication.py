import logging


def _close_session(session):
    try:
        next(session)
    except StopIteration:
        return


def test_publish_domain_event_after_commit_waits_for_managed_commit(monkeypatch):
    from app.database import db_session
    from app.events import EventScope, publish_domain_event_after_commit

    calls = []

    monkeypatch.setattr(
        "app.events.broker.publish_nowait",
        lambda *, scope, event_type, payload: calls.append((scope, event_type, payload)),
    )

    session = db_session()
    db = next(session)

    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="library"),
        event_type="bookDeleted",
        payload={"bookId": 7},
    )

    assert calls == []

    _close_session(session)

    assert calls == [(EventScope(kind="library"), "bookDeleted", {"bookId": 7})]


def test_publish_domain_event_after_commit_does_not_publish_on_rollback(monkeypatch):
    from app.database import db_session
    from app.events import EventScope, publish_domain_event_after_commit

    calls = []

    monkeypatch.setattr(
        "app.events.broker.publish_nowait",
        lambda *, scope, event_type, payload: calls.append((scope, event_type, payload)),
    )

    session = db_session()
    db = next(session)

    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="library"),
        event_type="bookDeleted",
        payload={"bookId": 7},
    )

    try:
        session.throw(RuntimeError("rollback"))
    except RuntimeError:
        pass

    assert calls == []


def test_publish_domain_event_after_commit_publishes_immediately_outside_managed_session(
    monkeypatch,
):
    from app.database import _get_db
    from app.events import EventScope, publish_domain_event_after_commit

    calls = []
    db = _get_db()

    monkeypatch.setattr(
        "app.events.broker.publish_nowait",
        lambda *, scope, event_type, payload: calls.append((scope, event_type, payload)),
    )

    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="user", user_id=2),
        event_type="bookRatingChanged",
        payload={"bookId": 7, "rating": 5},
    )

    assert calls == [
        (EventScope(kind="user", user_id=2), "bookRatingChanged", {"bookId": 7, "rating": 5})
    ]


def test_publish_domain_event_after_commit_logs_and_swallows_broker_errors(
    monkeypatch,
    caplog,
):
    from app.database import db_session
    from app.events import EventScope, publish_domain_event_after_commit

    def failing_publish(**_kwargs):
        raise RuntimeError("broker down")

    monkeypatch.setattr("app.events.broker.publish_nowait", failing_publish)

    session = db_session()
    db = next(session)

    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="user", user_id=2),
        event_type="bookRatingChanged",
        payload={"bookId": 7, "rating": 5},
    )

    with caplog.at_level(logging.ERROR, logger="librarium.events"):
        _close_session(session)

    assert "Failed to publish domain event after commit" in caplog.text
