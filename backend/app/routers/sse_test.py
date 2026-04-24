# TEMP SPIKE: SSE validation through Cloudflare (bd ewg0 pre-check).
# Удалить после валидации — endpoint и include_router в main.py.
import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api", tags=["_sse_spike"])


@router.get("/_sse_ping")
async def sse_ping() -> StreamingResponse:
    """Шлёт event каждые 2 сек: data: {"n": counter, "ts": iso}.
    Без auth (spike). Смотрим держит ли Cloudflare persistent connection."""
    async def event_stream():
        counter = 0
        while True:
            counter += 1
            ts = datetime.now(timezone.utc).isoformat()
            yield f"data: {json.dumps({'n': counter, 'ts': ts})}\n\n"
            await asyncio.sleep(2.0)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
