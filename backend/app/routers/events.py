from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..auth import CurrentUser, get_current_user
from ..events import broker, format_sse_event

router = APIRouter(tags=["events"])


@router.get("/api/events/stream")
async def stream_events(user: Annotated[CurrentUser, Depends(get_current_user)]):
    subscription = broker.subscribe(user.user_id)

    async def event_stream():
        try:
            while True:
                event = await subscription.get()
                yield format_sse_event(event)
        finally:
            broker.unsubscribe(subscription)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
