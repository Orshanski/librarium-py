import asyncio
from datetime import UTC, datetime
import json
import logging
import sqlite3
import threading
from dataclasses import dataclass
from typing import Any, Literal, TypedDict

from .database import add_after_commit_hook, open_event_db

log = logging.getLogger("librarium.events")


@dataclass(frozen=True)
class EventScope:
    kind: Literal["library", "user"]
    user_id: int | None = None

    def to_wire(self) -> dict[str, Any]:
        if self.kind == "user":
            if self.user_id is None:
                raise ValueError("user scope requires user_id")
            return {"kind": "user", "userId": self.user_id}
        return {"kind": "library"}

    def matches(self, user_id: int) -> bool:
        return self.kind == "library" or self.user_id == user_id


class ServerEvent(TypedDict):
    eventId: int
    publishedAt: str
    scope: dict[str, Any]
    event: dict[str, Any]


@dataclass
class EventSubscription:
    user_id: int
    queue: asyncio.Queue[ServerEvent | None]
    loop: asyncio.AbstractEventLoop
    closed: bool = False

    async def get(self) -> ServerEvent:
        if self.closed:
            raise asyncio.CancelledError
        item = await self.queue.get()
        if item is None or self.closed:
            raise asyncio.CancelledError
        return item

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        self.loop.call_soon_threadsafe(self._wake_closed)

    def _wake_closed(self) -> None:
        while True:
            try:
                self.queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        self.queue.put_nowait(None)


class EventBroker:
    def __init__(self, queue_size: int = 100) -> None:
        self._queue_size = queue_size
        self._lock = threading.Lock()
        self._subscriptions: list[EventSubscription] = []

    def subscribe(self, user_id: int) -> EventSubscription:
        loop = asyncio.get_running_loop()
        subscription = EventSubscription(
            user_id=user_id,
            queue=asyncio.Queue(maxsize=self._queue_size),
            loop=loop,
        )
        with self._lock:
            self._subscriptions.append(subscription)
        return subscription

    def unsubscribe(self, subscription: EventSubscription) -> None:
        with self._lock:
            self._subscriptions = [sub for sub in self._subscriptions if sub is not subscription]
            subscription.close()

    def close_all(self) -> None:
        with self._lock:
            subscriptions = self._subscriptions
            self._subscriptions = []
        for subscription in subscriptions:
            subscription.close()

    def publish_nowait(self, *, scope: EventScope, event_type: str, payload: dict[str, Any]) -> None:
        wire_event = append_publication(scope=scope, event_type=event_type, payload=payload)
        with self._lock:
            subscriptions = [sub for sub in self._subscriptions if not sub.closed and scope.matches(sub.user_id)]

        for subscription in subscriptions:
            subscription.loop.call_soon_threadsafe(self._deliver, subscription, wire_event)

    def _deliver(self, subscription: EventSubscription, event: ServerEvent) -> None:
        if subscription.closed:
            return
        try:
            subscription.queue.put_nowait(event)
        except asyncio.QueueFull:
            log.warning("Dropping slow SSE client user_id=%s", subscription.user_id)
            self.unsubscribe(subscription)


broker = EventBroker()


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def append_publication(*, scope: EventScope, event_type: str, payload: dict[str, Any]) -> ServerEvent:
    db = open_event_db()
    published_at = _utc_now_iso()
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    try:
        cursor = db.execute(
            """
            INSERT INTO sse_publications (
                scope_kind, user_id, event_type, payload_json, envelope_json, published_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (scope.kind, scope.user_id, event_type, payload_json, "{}", published_at),
        )
        event_id = int(cursor.lastrowid)
        envelope: ServerEvent = {
            "eventId": event_id,
            "publishedAt": published_at,
            "scope": scope.to_wire(),
            "event": {"type": event_type, "payload": payload},
        }
        db.execute(
            "UPDATE sse_publications SET envelope_json = ? WHERE event_id = ?",
            (json.dumps(envelope, ensure_ascii=False, separators=(",", ":")), event_id),
        )
        db.commit()
        return envelope
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def publish_domain_event_after_commit(
    db: sqlite3.Connection,
    *,
    scope: EventScope,
    event_type: str,
    payload: dict[str, Any],
    event_broker: EventBroker = broker,
) -> bool:
    """Publish a domain event after managed commit, or immediately outside one.

    Returns True when publication was deferred to a managed db_session commit.
    Returns False when no matching managed session exists and the event was
    published immediately.
    """
    def publish() -> None:
        try:
            event_broker.publish_nowait(scope=scope, event_type=event_type, payload=payload)
        except Exception:
            log.exception("Failed to publish domain event after commit type=%s", event_type)

    if add_after_commit_hook(db, publish):
        return True

    publish()
    return False


def format_sse_event(event: ServerEvent) -> str:
    return f"event: domain\ndata: {json.dumps(event, ensure_ascii=False, separators=(',', ':'))}\n\n"
