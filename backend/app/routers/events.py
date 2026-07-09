import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..auth import CurrentUser, get_current_user
from ..events import (
    MalformedPublicationError,
    broker,
    current_publication_tail,
    format_sse_event,
    format_sse_reset,
    next_publication_after,
    oldest_publication_id,
)

router = APIRouter(tags=["events"])
SSE_KEEPALIVE_INTERVAL_SECONDS = 15.0
log = logging.getLogger("librarium.events")


def close_event_streams() -> None:
    broker.close_all()


def parse_since(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


@router.get("/api/events/stream")
async def stream_events(request: Request, user: Annotated[CurrentUser, Depends(get_current_user)]):
    explicit_cursor = parse_since(request.query_params.get("since"))
    tail = current_publication_tail()
    oldest = oldest_publication_id()
    must_reset = False
    if explicit_cursor is None:
        cursor = tail
    elif oldest is not None and explicit_cursor < oldest - 1:
        cursor = tail
        must_reset = True
    else:
        cursor = explicit_cursor

    async def event_stream():
        nonlocal cursor, must_reset
        if must_reset:
            must_reset = False
            yield format_sse_reset(resume_after_event_id=cursor)
        while True:
            if await request.is_disconnected():
                break
            try:
                event = next_publication_after(user_id=user.user_id, cursor=cursor)
            except MalformedPublicationError:
                log.exception(
                    "Malformed SSE publication at cursor=%s user_id=%s",
                    int(cursor),
                    str(user.user_id),
                )
                break
            except Exception:
                log.exception(
                    "Failed to read SSE publication at cursor=%s user_id=%s",
                    int(cursor),
                    str(user.user_id),
                )
                break
            if event is not None:
                cursor = int(event["eventId"])
                yield format_sse_event(event)
                continue

            try:
                await broker.wait_for_publication(
                    user_id=user.user_id,
                    timeout=SSE_KEEPALIVE_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                if await request.is_disconnected():
                    break
                yield ":ping\n\n"
            except asyncio.CancelledError:
                break

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
