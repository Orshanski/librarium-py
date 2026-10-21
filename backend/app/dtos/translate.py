"""Тело запроса перевода выделенного (POST /api/translate/chat)."""
from typing import Literal

from pydantic import BaseModel, Field

from ._aliases import BODY_CONFIG

# Защитный потолок, а не правило: самый длинный абзац библиотеки — около 47 тыс. знаков.
MAX_TEXT_LENGTH = 200_000
MAX_MESSAGES = 100


class TranslateMessage(BaseModel):
    model_config = BODY_CONFIG

    role: Literal["user", "assistant"]
    text: str = Field(max_length=MAX_TEXT_LENGTH)


class TranslateChatBody(BaseModel):
    """История — без первого сообщения: его собирает сервер из книги, абзаца и выделенного."""
    model_config = BODY_CONFIG

    book_id: int
    selected_text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    paragraph: str = Field(max_length=MAX_TEXT_LENGTH)
    messages: list[TranslateMessage] = Field(max_length=MAX_MESSAGES)
    target_language: Literal["ru", "en"]
