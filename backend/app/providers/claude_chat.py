"""Разговор с Claude потоком: отдаёт куски текста ответа по мере генерации."""
from collections.abc import AsyncIterator

import anthropic
from anthropic.types.beta import BetaMessageParam

from ..config import (
    ANTHROPIC_API_KEY,
    ANTHROPIC_TIMEOUT_SEC,
    TRANSLATE_EFFORT,
    TRANSLATE_MAX_TOKENS,
    TRANSLATE_MODEL,
)

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class ModelRefusal(Exception):
    """Модель отказалась отвечать на запрос."""


async def stream_text(*, system: str, messages: list[BetaMessageParam]) -> AsyncIterator[str]:
    """Закрытие генератора (человек закрыл окно посреди ответа) закрывает и поток Anthropic."""
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY, timeout=ANTHROPIC_TIMEOUT_SEC)
    async with client.beta.messages.stream(
        model=TRANSLATE_MODEL,
        max_tokens=TRANSLATE_MAX_TOKENS,
        system=system,
        messages=messages,
        output_config={"effort": TRANSLATE_EFFORT},
        fallbacks="default",
        betas=[FALLBACK_BETA],
    ) as stream:
        async for text in stream.text_stream:
            yield text
        final = await stream.get_final_message()
    if final.stop_reason == "refusal":
        raise ModelRefusal()
