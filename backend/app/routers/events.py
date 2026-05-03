import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..auth import CurrentUser, get_current_user
from ..events import broker, format_sse_event

router = APIRouter(tags=["events"])
SSE_KEEPALIVE_INTERVAL_SECONDS = 15.0


@router.get("/api/events/stream")
async def stream_events(request: Request, user: Annotated[CurrentUser, Depends(get_current_user)]):
    subscription = broker.subscribe(user.user_id)

    async def event_stream():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(
                        subscription.get(),
                        timeout=SSE_KEEPALIVE_INTERVAL_SECONDS,
                    )
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        break
                    yield ":ping\n\n"
                    continue
                yield format_sse_event(event)
        finally:
            broker.unsubscribe(subscription)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
