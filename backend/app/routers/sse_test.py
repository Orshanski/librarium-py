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
    """Idle-паттерн: data event раз в 60 сек, keepalive ':ping\\n\\n' раз в 25 сек.
    Проверяем что connection переживает idle-timeout'ы (Cloudflare ~100s, nginx ~60s).
    Без auth (spike)."""
    async def event_stream():
        counter = 0
        while True:
            # 25s keepalive × 2 = 50s idle без data
            for _ in range(2):
                await asyncio.sleep(25.0)
                yield ": ping\n\n"
            # data event — раз в 60 сек (за 2 keepalive прошло 50 + 10 = 60)
            await asyncio.sleep(10.0)
            counter += 1
            ts = datetime.now(timezone.utc).isoformat()
            yield f"data: {json.dumps({'n': counter, 'ts': ts})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
