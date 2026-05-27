import asyncio
from datetime import UTC, datetime, timedelta
import json
import logging
import sqlite3
import threading
from dataclasses import dataclass
from typing import Any, Literal, TypedDict

from .database import add_after_commit_hook, open_event_db

log = logging.getLogger("librarium.events")
_last_prune_at: str | None = None


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
    event: asyncio.Event
    loop: asyncio.AbstractEventLoop
    closed: bool = False

    async def wait(self, timeout: float) -> None:
        if self.closed:
            raise asyncio.CancelledError
        try:
            await asyncio.wait_for(self.event.wait(), timeout=timeout)
        finally:
            self.event.clear()
        if self.closed:
            raise asyncio.CancelledError

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        self.loop.call_soon_threadsafe(self.event.set)


class EventBroker:
    def __init__(self, queue_size: int = 100) -> None:
        self._lock = threading.Lock()
        self._subscriptions: list[EventSubscription] = []

    def subscribe(self, user_id: int) -> EventSubscription:
        loop = asyncio.get_running_loop()
        subscription = EventSubscription(
            user_id=user_id,
            event=asyncio.Event(),
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

    async def wait_for_publication(self, *, user_id: int, timeout: float) -> None:
        subscription = self.subscribe(user_id)
        try:
            await subscription.wait(timeout)
        finally:
            self.unsubscribe(subscription)

    def publish_nowait(self, *, scope: EventScope, event_type: str, payload: dict[str, Any]) -> None:
        with self._lock:
            subscriptions = [sub for sub in self._subscriptions if not sub.closed and scope.matches(sub.user_id)]

        append_publication(scope=scope, event_type=event_type, payload=payload)
        maybe_prune_old_publications_after_publish()

        for subscription in subscriptions:
            subscription.loop.call_soon_threadsafe(subscription.event.set)


broker = EventBroker()


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _parse_utc_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


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


class MalformedPublicationError(ValueError):
    pass


def _raise_malformed_envelope() -> None:
    raise MalformedPublicationError("malformed SSE publication envelope")


def _load_envelope(row: sqlite3.Row) -> ServerEvent:
    try:
        envelope = json.loads(row["envelope_json"])
    except (TypeError, json.JSONDecodeError) as exc:
        raise MalformedPublicationError("malformed SSE publication envelope") from exc
    if not isinstance(envelope, dict):
        _raise_malformed_envelope()
    event_id = envelope.get("eventId")
    if (
        not isinstance(event_id, int)
        or isinstance(event_id, bool)
        or event_id != row["event_id"]
    ):
        _raise_malformed_envelope()
    if not isinstance(envelope.get("publishedAt"), str):
        _raise_malformed_envelope()

    scope = envelope.get("scope")
    if not isinstance(scope, dict):
        _raise_malformed_envelope()
    scope_kind = scope.get("kind")
    if scope_kind == "user":
        user_id = scope.get("userId")
        if type(user_id) is not int:
            _raise_malformed_envelope()
    elif scope_kind != "library":
        _raise_malformed_envelope()

    event = envelope.get("event")
    if not isinstance(event, dict):
        _raise_malformed_envelope()
    if not isinstance(event.get("type"), str):
        _raise_malformed_envelope()
    if not isinstance(event.get("payload"), dict):
        _raise_malformed_envelope()

    return envelope


def next_publication_after(*, user_id: int, cursor: int) -> ServerEvent | None:
    db = open_event_db()
    try:
        row = db.execute(
            """
            SELECT event_id, envelope_json
            FROM sse_publications
            WHERE event_id > ?
              AND (
                scope_kind = 'library'
                OR (scope_kind = 'user' AND user_id = ?)
              )
            ORDER BY event_id
            LIMIT 1
            """,
            (cursor, user_id),
        ).fetchone()
        if row is None:
            return None
        return _load_envelope(row)
    finally:
        db.close()


def current_publication_tail() -> int:
    db = open_event_db()
    try:
        row = db.execute(
            "SELECT COALESCE(MAX(event_id), 0) AS event_id FROM sse_publications"
        ).fetchone()
        return int(row["event_id"])
    finally:
        db.close()


def oldest_publication_id() -> int | None:
    db = open_event_db()
    try:
        row = db.execute(
            "SELECT MIN(event_id) AS event_id FROM sse_publications"
        ).fetchone()
        if row["event_id"] is None:
            return None
        return int(row["event_id"])
    finally:
        db.close()


def format_sse_reset(resume_after_event_id: int) -> str:
    payload = {
        "reason": "publication_cursor_expired",
        "resumeAfterEventId": resume_after_event_id,
    }
    return f"event: reset\ndata: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"


def prune_old_publications(retention_days: int = 30, now_iso: str | None = None) -> int:
    now = _parse_utc_iso(now_iso or _utc_now_iso())
    cutoff = (now - timedelta(days=retention_days)).isoformat(
        timespec="microseconds"
    ).replace("+00:00", "Z")
    db = open_event_db()
    try:
        cursor = db.execute(
            "DELETE FROM sse_publications WHERE published_at < ?",
            (cutoff,),
        )
        db.commit()
        return cursor.rowcount
    except sqlite3.OperationalError as exc:
        db.rollback()
        if "no such table: sse_publications" in str(exc):
            log.warning("Skipping SSE publication prune: sse_publications table is missing")
            return 0
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def maybe_prune_old_publications_after_publish(now_iso: str | None = None) -> None:
    global _last_prune_at

    now = now_iso or _utc_now_iso()
    prune_day = now[:10]
    if _last_prune_at == prune_day:
        return
    try:
        prune_old_publications(now_iso=now)
    except Exception:
        log.exception("Failed to prune old SSE publications")
        return
    _last_prune_at = prune_day


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
