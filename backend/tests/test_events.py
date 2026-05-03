import asyncio
import json
import threading


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
