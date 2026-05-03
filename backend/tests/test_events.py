import asyncio
import json
import threading
from dataclasses import dataclass

import pytest


def test_broker_delivers_library_events_to_all_connections():
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        left = broker.subscribe(user_id=1)
        right = broker.subscribe(user_id=2)

        broker.publish_nowait(
            scope=EventScope(kind="library"),
            event_type="bookDeleted",
            payload={"bookId": 7},
        )

        assert await asyncio.wait_for(left.get(), timeout=0.1) == {
            "eventId": 1,
            "scope": {"kind": "library"},
            "event": {"type": "bookDeleted", "payload": {"bookId": 7}},
        }
        assert await asyncio.wait_for(right.get(), timeout=0.1) == {
            "eventId": 1,
            "scope": {"kind": "library"},
            "event": {"type": "bookDeleted", "payload": {"bookId": 7}},
        }

    asyncio.run(scenario())


def test_broker_delivers_user_events_only_to_matching_user():
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        reader = broker.subscribe(user_id=2)
        other = broker.subscribe(user_id=3)

        broker.publish_nowait(
            scope=EventScope(kind="user", user_id=2),
            event_type="bookRatingChanged",
            payload={"bookId": 7, "rating": 5},
        )

        assert await asyncio.wait_for(reader.get(), timeout=0.1) == {
            "eventId": 1,
            "scope": {"kind": "user", "userId": 2},
            "event": {"type": "bookRatingChanged", "payload": {"bookId": 7, "rating": 5}},
        }
        try:
            await asyncio.wait_for(other.get(), timeout=0.05)
        except asyncio.TimeoutError:
            pass
        else:
            raise AssertionError("event leaked to another user")

    asyncio.run(scenario())


def test_broker_publish_nowait_is_safe_from_worker_thread():
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        sub = broker.subscribe(user_id=1)

        thread = threading.Thread(
            target=lambda: broker.publish_nowait(
                scope=EventScope(kind="library"),
                event_type="bookCreated",
                payload={"bookId": 8},
            ),
        )
        thread.start()
        thread.join(timeout=1)

        assert await asyncio.wait_for(sub.get(), timeout=0.1) == {
            "eventId": 1,
            "scope": {"kind": "library"},
            "event": {"type": "bookCreated", "payload": {"bookId": 8}},
        }

    asyncio.run(scenario())


def test_broker_queue_overflow_wakes_closed_subscription():
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        sub = broker.subscribe(user_id=1)

        broker.publish_nowait(
            scope=EventScope(kind="library"),
            event_type="bookCreated",
            payload={"bookId": 8},
        )
        broker.publish_nowait(
            scope=EventScope(kind="library"),
            event_type="bookUpdated",
            payload={"bookId": 8},
        )
        broker.publish_nowait(
            scope=EventScope(kind="library"),
            event_type="bookDeleted",
            payload={"bookId": 8},
        )
        await asyncio.sleep(0)
        await asyncio.sleep(0)

        assert sub.closed

        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(sub.get(), timeout=0.1)

        broker.publish_nowait(
            scope=EventScope(kind="library"),
            event_type="bookRestored",
            payload={"bookId": 8},
        )
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(sub.get(), timeout=0.05)

    asyncio.run(scenario())


def test_broker_queue_overflow_cancels_pending_get_before_stale_event_yields():
    from app.events import EventBroker, EventScope

    async def scenario():
        broker = EventBroker(queue_size=2)
        sub = broker.subscribe(user_id=1)
        pending_get = asyncio.create_task(sub.get())
        await asyncio.sleep(0)

        broker.publish_nowait(
            scope=EventScope(kind="library"),
            event_type="bookCreated",
            payload={"bookId": 8},
        )
        broker.publish_nowait(
            scope=EventScope(kind="library"),
            event_type="bookUpdated",
            payload={"bookId": 8},
        )
        broker.publish_nowait(
            scope=EventScope(kind="library"),
            event_type="bookDeleted",
            payload={"bookId": 8},
        )

        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(pending_get, timeout=0.1)
        assert sub.closed

    asyncio.run(scenario())


def test_broker_close_all_wakes_pending_subscriptions():
    from app.events import EventBroker

    async def scenario():
        broker = EventBroker(queue_size=2)
        left = broker.subscribe(user_id=1)
        right = broker.subscribe(user_id=2)
        pending_left = asyncio.create_task(left.get())
        pending_right = asyncio.create_task(right.get())
        await asyncio.sleep(0)

        broker.close_all()

        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(pending_left, timeout=0.1)
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(pending_right, timeout=0.1)
        assert left.closed
        assert right.closed

    asyncio.run(scenario())


def test_sse_format_uses_domain_event_name_and_json_payload():
    from app.events import format_sse_event

    text = format_sse_event({
        "eventId": 3,
        "scope": {"kind": "library"},
        "event": {"type": "bookDeleted", "payload": {"bookId": 7}},
    })

    assert text.startswith("event: domain\n")
    assert text.endswith("\n\n")
    data_line = next(line for line in text.splitlines() if line.startswith("data: "))
    assert json.loads(data_line.removeprefix("data: ")) == {
        "eventId": 3,
        "scope": {"kind": "library"},
        "event": {"type": "bookDeleted", "payload": {"bookId": 7}},
    }


def test_events_stream_requires_auth(anon_client):
    resp = anon_client.get("/api/events/stream")

    assert resp.status_code == 401


def test_events_stream_sets_sse_proxy_safe_headers(monkeypatch):
    from app.auth import CurrentUser
    from app.routers import events as events_router

    @dataclass
    class FakeSubscription:
        async def get(self):
            await asyncio.Event().wait()

    class FakeBroker:
        def subscribe(self, user_id):
            assert user_id == 2
            return FakeSubscription()

        def unsubscribe(self, subscription):
            pass

    class FakeRequest:
        async def is_disconnected(self):
            return True

    monkeypatch.setattr(events_router, "broker", FakeBroker())

    response = asyncio.run(
        events_router.stream_events(FakeRequest(), CurrentUser(user_id=2, role="reader"))
    )

    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["connection"] == "keep-alive"
    assert response.headers["x-accel-buffering"] == "no"


def test_events_stream_yields_keepalive_ping_and_unsubscribes_on_disconnect(monkeypatch):
    from app.auth import CurrentUser
    from app.routers import events as events_router

    @dataclass
    class FakeSubscription:
        async def get(self):
            await asyncio.Event().wait()

    class FakeBroker:
        def __init__(self):
            self.subscription = FakeSubscription()
            self.unsubscribed = False

        def subscribe(self, user_id):
            assert user_id == 2
            return self.subscription

        def unsubscribe(self, subscription):
            assert subscription is self.subscription
            self.unsubscribed = True

    class FakeRequest:
        def __init__(self):
            self.calls = 0

        async def is_disconnected(self):
            self.calls += 1
            return self.calls > 2

    async def scenario():
        fake_broker = FakeBroker()
        monkeypatch.setattr(events_router, "broker", fake_broker)
        monkeypatch.setattr(events_router, "SSE_KEEPALIVE_INTERVAL_SECONDS", 0.001)

        response = await events_router.stream_events(
            FakeRequest(),
            CurrentUser(user_id=2, role="reader"),
        )
        iterator = response.body_iterator.__aiter__()

        assert await iterator.__anext__() == ":ping\n\n"
        with pytest.raises(StopAsyncIteration):
            await iterator.__anext__()
        assert fake_broker.unsubscribed is True

    asyncio.run(scenario())
