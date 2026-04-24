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
    """Idle-паттерн: data event раз в 5 мин, keepalive ':ping\\n\\n' каждые 25 сек.
    Проверяем длинный idle через Cloudflare/nginx — реальный use case
    (mutations в библиотеке редкие). Без auth (spike)."""
    async def event_stream():
        counter = 0
        while True:
            # 11 keepalive × 25 сек = 275 сек = 4:35
            for _ in range(11):
                await asyncio.sleep(25.0)
                yield ": ping\n\n"
            # +25 сек до data — ровно 5 мин цикл
            await asyncio.sleep(25.0)
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
