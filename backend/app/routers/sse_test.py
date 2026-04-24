# TEMP SPIKE: SSE validation через Cloudflare (bd ewg0 pre-check).
# Broker-паттерн: один глобальный counter + background task, все подключённые клиенты
# получают одинаковые события через asyncio.Queue. Счётчик независим от lifecycle
# клиентов — сохраняется между reload'ами страницы, меняется только при рестарте процесса.
# Удалить после валидации — endpoint и include_router в main.py.
import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api", tags=["_sse_spike"])

# Module-level — фиксируется при импорте модуля (т.е. при запуске процесса uvicorn)
SERVER_STARTED_AT = datetime.now(timezone.utc).isoformat()

_counter: int = 0
_subscribers: set[asyncio.Queue] = set()
_bg_started: bool = False
_bg_lock = asyncio.Lock()


def _make_data_frame(n: int) -> str:
    payload = {
        "n": n,
        "ts": datetime.now(timezone.utc).isoformat(),
        "server_started_at": SERVER_STARTED_AT,
    }
    return f"data: {json.dumps(payload)}\n\n"


async def _tick_forever():
    """Каждые 5 мин инкрементит counter и публикует data frame всем subscribers."""
    global _counter
    while True:
        await asyncio.sleep(300.0)
        _counter += 1
        frame = _make_data_frame(_counter)
        for q in list(_subscribers):
            try:
                q.put_nowait(frame)
            except asyncio.QueueFull:
                pass


async def _keepalive_forever():
    """Каждые 25 сек публикует ':ping\\n\\n' keepalive (под Cloudflare/nginx idle timeouts)."""
    while True:
        await asyncio.sleep(25.0)
        for q in list(_subscribers):
            try:
                q.put_nowait(": ping\n\n")
            except asyncio.QueueFull:
                pass


async def _ensure_background_started():
    """Lazy-запуск background tasks при первом подключении клиента."""
    global _bg_started
    if _bg_started:
        return
    async with _bg_lock:
        if _bg_started:
            return
        asyncio.create_task(_tick_forever())
        asyncio.create_task(_keepalive_forever())
        _bg_started = True


@router.get("/_sse_ping")
async def sse_ping() -> StreamingResponse:
    """Подписка на broker: initial event с текущим counter + server_started_at, далее
    приём из персональной queue. Counter общий для всех клиентов."""
    await _ensure_background_started()
    queue: asyncio.Queue = asyncio.Queue(maxsize=200)
    _subscribers.add(queue)

    async def event_stream():
        try:
            # Initial snapshot — не зависит от background tick'а, даёт клиенту
            # немедленный сигнал что connection живой + текущий state.
            yield _make_data_frame(_counter)
            while True:
                frame = await queue.get()
                yield frame
        finally:
            _subscribers.discard(queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
