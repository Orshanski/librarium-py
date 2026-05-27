import asyncio
import json
import threading

import pytest


def test_broker_wakes_library_publications_for_all_connections():
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        left = broker.subscribe(user_id=1)
        right = broker.subscribe(user_id=2)
        left_wait = asyncio.create_task(left.wait(timeout=0.1))
        right_wait = asyncio.create_task(right.wait(timeout=0.1))
        await asyncio.sleep(0)

        broker.publish_nowait(
            scope=EventScope(kind="library"),
            event_type="bookDeleted",
            payload={"bookId": 7},
        )

        await left_wait
        await right_wait

    asyncio.run(scenario())


def test_broker_wakes_user_publications_only_for_matching_user():
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        reader = broker.subscribe(user_id=2)
        other = broker.subscribe(user_id=3)
        reader_wait = asyncio.create_task(reader.wait(timeout=0.1))
        other_wait = asyncio.create_task(other.wait(timeout=0.05))
        await asyncio.sleep(0)

        broker.publish_nowait(
            scope=EventScope(kind="user", user_id=2),
            event_type="bookRatingChanged",
            payload={"bookId": 7, "rating": 5},
        )

        await reader_wait
        with pytest.raises(asyncio.TimeoutError):
            await other_wait

    asyncio.run(scenario())


def test_broker_wake_notification_is_safe_from_worker_thread():
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        sub = broker.subscribe(user_id=1)
        pending_wait = asyncio.create_task(sub.wait(timeout=0.1))
        await asyncio.sleep(0)

        thread = threading.Thread(
            target=lambda: broker.publish_nowait(
                scope=EventScope(kind="library"),
                event_type="bookCreated",
                payload={"bookId": 8},
            ),
        )
        thread.start()
        thread.join(timeout=1)

        await pending_wait

    asyncio.run(scenario())


def test_publish_nowait_persists_exact_envelope(db_test):
    from app.events import EventBroker, EventScope

    broker = EventBroker(queue_size=2)
    payload = {"bookId": 7, "isRead": True}

    broker.publish_nowait(
        scope=EventScope(kind="user", user_id=2),
        event_type="bookReadChanged",
        payload=payload,
    )

    row = db_test.execute(
        """
        SELECT event_id, scope_kind, user_id, event_type, payload_json, envelope_json, published_at
        FROM sse_publications
        """
    ).fetchone()

    assert row["event_id"] == 1
    assert row["scope_kind"] == "user"
    assert row["user_id"] == 2
    assert row["event_type"] == "bookReadChanged"
    assert json.loads(row["payload_json"]) == payload
    assert json.loads(row["envelope_json"]) == {
        "eventId": row["event_id"],
        "publishedAt": row["published_at"],
        "scope": {"kind": "user", "userId": 2},
        "event": {"type": "bookReadChanged", "payload": payload},
    }


def test_publish_nowait_uses_dedicated_connection(monkeypatch, db):
    import app.events as events_module
    from app.events import EventBroker, EventScope

    real_open_event_db = events_module.open_event_db
    captured_connections = []

    def capture_open_event_db():
        conn = real_open_event_db()
        captured_connections.append(conn)
        return conn

    monkeypatch.setattr(events_module, "open_event_db", capture_open_event_db)

    EventBroker(queue_size=2).publish_nowait(
        scope=EventScope(kind="library"),
        event_type="bookDeleted",
        payload={"bookId": 7},
    )

    assert captured_connections
    assert all(conn is not db for conn in captured_connections)


def test_publish_nowait_wakes_only_subscribers_snapshotted_before_append(monkeypatch):
    import app.events as events_module
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        initial = broker.subscribe(user_id=2)
        initial_wait = asyncio.create_task(initial.wait(timeout=0.1))
        late = None
        envelope = {
            "eventId": 1,
            "publishedAt": "2026-05-27T12:00:00Z",
            "scope": {"kind": "user", "userId": 2},
            "event": {"type": "bookReadChanged", "payload": {"bookId": 7, "isRead": True}},
        }

        def append_during_subscribe(*, scope, event_type, payload):
            nonlocal late
            late = broker.subscribe(user_id=2)
            return envelope

        monkeypatch.setattr(events_module, "append_publication", append_during_subscribe)

        broker.publish_nowait(
            scope=EventScope(kind="user", user_id=2),
            event_type="bookReadChanged",
            payload={"bookId": 7, "isRead": True},
        )

        await initial_wait
        assert late is not None
        with pytest.raises(asyncio.TimeoutError):
            await late.wait(timeout=0.05)

    asyncio.run(scenario())


def test_publish_nowait_raises_and_does_not_wake_when_append_fails(monkeypatch):
    import app.events as events_module
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        sub = broker.subscribe(user_id=2)
        pending_wait = asyncio.create_task(sub.wait(timeout=0.05))
        await asyncio.sleep(0)

        def fail_append(*, scope, event_type, payload):
            raise RuntimeError("db down")

        monkeypatch.setattr(events_module, "append_publication", fail_append)

        with pytest.raises(RuntimeError, match="db down"):
            broker.publish_nowait(
                scope=EventScope(kind="user", user_id=2),
                event_type="bookReadChanged",
                payload={"bookId": 7, "isRead": True},
            )

        with pytest.raises(asyncio.TimeoutError):
            await pending_wait
        assert sub.closed is False

    asyncio.run(scenario())


def test_broker_matching_publication_wakes_waiting_stream_subscription():
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        pending_wait = asyncio.create_task(
            broker.wait_for_publication(user_id=1, timeout=0.1)
        )
        await asyncio.sleep(0)

        broker.publish_nowait(
            scope=EventScope(kind="library"),
            event_type="bookCreated",
            payload={"bookId": 8},
        )

        await pending_wait

    asyncio.run(scenario())


def test_broker_non_matching_user_publication_does_not_wake_before_timeout():
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        pending_wait = asyncio.create_task(
            broker.wait_for_publication(user_id=1, timeout=0.05)
        )
        await asyncio.sleep(0)

        broker.publish_nowait(
            scope=EventScope(kind="user", user_id=2),
            event_type="bookCreated",
            payload={"bookId": 8},
        )

        with pytest.raises(asyncio.TimeoutError):
            await pending_wait

    asyncio.run(scenario())


def test_broker_close_all_wakes_and_cancels_pending_waiters():
    from app.events import EventBroker

    async def scenario():
        broker = EventBroker(queue_size=2)
        pending_left = asyncio.create_task(
            broker.wait_for_publication(user_id=1, timeout=1.0)
        )
        pending_right = asyncio.create_task(
            broker.wait_for_publication(user_id=2, timeout=1.0)
        )
        await asyncio.sleep(0)

        broker.close_all()

        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(pending_left, timeout=0.1)
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(pending_right, timeout=0.1)

    asyncio.run(scenario())


def test_next_publication_filters_visible_stream_by_user():
    from app.events import EventBroker, EventScope, next_publication_after

    broker = EventBroker(queue_size=2)
    broker.publish_nowait(
        scope=EventScope(kind="library"),
        event_type="bookDeleted",
        payload={"bookId": 1},
    )
    broker.publish_nowait(
        scope=EventScope(kind="user", user_id=2),
        event_type="bookReadChanged",
        payload={"bookId": 2, "isRead": True},
    )
    broker.publish_nowait(
        scope=EventScope(kind="user", user_id=3),
        event_type="bookReadChanged",
        payload={"bookId": 3, "isRead": True},
    )

    first = next_publication_after(user_id=2, cursor=0)
    assert first is not None
    second = next_publication_after(user_id=2, cursor=first["eventId"])
    assert second is not None
    third = next_publication_after(user_id=2, cursor=second["eventId"])

    assert first["event"] == {"type": "bookDeleted", "payload": {"bookId": 1}}
    assert second["event"] == {
        "type": "bookReadChanged",
        "payload": {"bookId": 2, "isRead": True},
    }
    assert third is None


def test_next_publication_rejects_matching_id_envelope_missing_wire_fields(db_test):
    from app.events import MalformedPublicationError, next_publication_after

    db_test.execute(
        """
        INSERT INTO sse_publications (
            event_id, scope_kind, user_id, event_type, payload_json, envelope_json, published_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            12,
            "library",
            None,
            "bookDeleted",
            "{}",
            json.dumps({"eventId": 12}),
            "2026-05-27T08:00:00Z",
        ),
    )
    db_test.commit()

    with pytest.raises(MalformedPublicationError, match="malformed SSE publication envelope"):
        next_publication_after(user_id=2, cursor=11)


def test_current_publication_tail_starts_new_clients_after_existing_rows():
    from app.events import EventBroker, EventScope, current_publication_tail

    assert current_publication_tail() == 0
    EventBroker(queue_size=2).publish_nowait(
        scope=EventScope(kind="library"),
        event_type="bookDeleted",
        payload={"bookId": 1},
    )
    assert current_publication_tail() == 1


def test_sse_format_uses_domain_event_name_and_json_payload():
    from app.events import format_sse_event

    text = format_sse_event({
        "eventId": 3,
        "publishedAt": "2026-05-27T12:00:00Z",
        "scope": {"kind": "library"},
        "event": {"type": "bookDeleted", "payload": {"bookId": 7}},
    })

    assert text.startswith("event: domain\n")
    assert text.endswith("\n\n")
    data_line = next(line for line in text.splitlines() if line.startswith("data: "))
    assert json.loads(data_line.removeprefix("data: ")) == {
        "eventId": 3,
        "publishedAt": "2026-05-27T12:00:00Z",
        "scope": {"kind": "library"},
        "event": {"type": "bookDeleted", "payload": {"bookId": 7}},
    }


def test_events_stream_requires_auth(anon_client):
    resp = anon_client.get("/api/events/stream")

    assert resp.status_code == 401


def test_events_stream_sets_sse_proxy_safe_headers(monkeypatch):
    from app.auth import CurrentUser
    from app.routers import events as events_router

    class FakeBroker:
        async def wait_for_publication(self, *, user_id, timeout):
            raise AssertionError("stream should stop before waiting")

    class FakeRequest:
        query_params = {}

        async def is_disconnected(self):
            return True

    monkeypatch.setattr(events_router, "broker", FakeBroker())
    monkeypatch.setattr(events_router, "current_publication_tail", lambda: 0)

    response = asyncio.run(
        events_router.stream_events(FakeRequest(), CurrentUser(user_id=2, role="reader"))
    )

    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["connection"] == "keep-alive"
    assert response.headers["x-accel-buffering"] == "no"


def test_events_stream_reads_from_since_and_then_pings(monkeypatch):
    from app.auth import CurrentUser
    from app.routers import events as events_router

    sent = [
        {
            "eventId": 11,
            "scope": {"kind": "library"},
            "event": {"type": "bookDeleted", "payload": {"bookId": 7}},
            "publishedAt": "2026-05-27T08:00:00Z",
        }
    ]
    cursors = []

    def fake_next_publication_after(*, user_id, cursor):
        assert user_id == 2
        cursors.append(cursor)
        return sent.pop(0) if sent else None

    class FakeBroker:
        async def wait_for_publication(self, *, user_id, timeout):
            assert user_id == 2
            await asyncio.sleep(0)
            raise asyncio.TimeoutError

    class FakeRequest:
        query_params = {"since": "10"}

        def __init__(self):
            self.disconnect_checks = 0

        async def is_disconnected(self):
            self.disconnect_checks += 1
            return self.disconnect_checks > 3

    async def scenario():
        monkeypatch.setattr(events_router, "next_publication_after", fake_next_publication_after)
        monkeypatch.setattr(events_router, "broker", FakeBroker())
        monkeypatch.setattr(events_router, "SSE_KEEPALIVE_INTERVAL_SECONDS", 0.001)
        response = await events_router.stream_events(
            FakeRequest(),
            CurrentUser(user_id=2, role="reader"),
        )
        iterator = response.body_iterator.__aiter__()

        first = await iterator.__anext__()
        assert first.startswith("event: domain\n")
        assert '"eventId":11' in first
        assert await iterator.__anext__() == ":ping\n\n"

    asyncio.run(scenario())
    assert cursors[:2] == [10, 11]


def test_events_stream_missing_since_starts_at_current_tail(monkeypatch):
    from app.auth import CurrentUser
    from app.routers import events as events_router

    seen = []

    def fake_next_publication_after(*, user_id, cursor):
        assert user_id == 2
        seen.append(cursor)
        return None

    class FakeBroker:
        async def wait_for_publication(self, *, user_id, timeout):
            assert user_id == 2
            raise asyncio.TimeoutError

    class FakeRequest:
        query_params = {}

        def __init__(self):
            self.disconnect_checks = 0

        async def is_disconnected(self):
            self.disconnect_checks += 1
            return self.disconnect_checks > 1

    async def scenario():
        monkeypatch.setattr(events_router, "current_publication_tail", lambda: 44)
        monkeypatch.setattr(events_router, "next_publication_after", fake_next_publication_after)
        monkeypatch.setattr(events_router, "broker", FakeBroker())
        response = await events_router.stream_events(
            FakeRequest(),
            CurrentUser(user_id=2, role="reader"),
        )
        iterator = response.body_iterator.__aiter__()
        with pytest.raises(StopAsyncIteration):
            await iterator.__anext__()

    asyncio.run(scenario())
    assert seen == [44]


def test_events_stream_rechecks_log_after_missed_notification_timeout(monkeypatch):
    from app.auth import CurrentUser
    from app.routers import events as events_router

    calls = 0

    def fake_next_publication_after(*, user_id, cursor):
        nonlocal calls
        assert user_id == 2
        calls += 1
        if calls == 1:
            return None
        return {
            "eventId": 12,
            "scope": {"kind": "library"},
            "event": {"type": "bookDeleted", "payload": {"bookId": 7}},
            "publishedAt": "2026-05-27T08:00:00Z",
        }

    class FakeBroker:
        async def wait_for_publication(self, *, user_id, timeout):
            assert user_id == 2
            raise asyncio.TimeoutError

    class FakeRequest:
        query_params = {"since": "11"}

        def __init__(self):
            self.disconnected = False

        async def is_disconnected(self):
            return self.disconnected

    async def scenario():
        request = FakeRequest()
        monkeypatch.setattr(events_router, "next_publication_after", fake_next_publication_after)
        monkeypatch.setattr(events_router, "broker", FakeBroker())
        monkeypatch.setattr(events_router, "SSE_KEEPALIVE_INTERVAL_SECONDS", 0.001)
        response = await events_router.stream_events(
            request,
            CurrentUser(user_id=2, role="reader"),
        )
        iterator = response.body_iterator.__aiter__()
        assert await iterator.__anext__() == ":ping\n\n"
        text = await iterator.__anext__()
        request.disconnected = True
        assert text.startswith("event: domain\n")
        assert '"eventId":12' in text

    asyncio.run(scenario())


def test_events_stream_logs_and_closes_on_malformed_publication(monkeypatch, caplog):
    from app.auth import CurrentUser
    from app.events import MalformedPublicationError
    from app.routers import events as events_router

    def fake_next_publication_after(*, user_id, cursor):
        raise MalformedPublicationError("malformed SSE publication envelope")

    class FakeRequest:
        query_params = {"since": "1"}

        async def is_disconnected(self):
            return False

    async def scenario():
        monkeypatch.setattr(events_router, "next_publication_after", fake_next_publication_after)
        response = await events_router.stream_events(
            FakeRequest(),
            CurrentUser(user_id=2, role="reader"),
        )
        iterator = response.body_iterator.__aiter__()
        with pytest.raises(StopAsyncIteration):
            await iterator.__anext__()

    with caplog.at_level("ERROR", logger="librarium.events"):
        asyncio.run(scenario())

    assert "Malformed SSE publication" in caplog.text
