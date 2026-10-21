"""Тело запроса перевода выделенного (POST /api/translate/chat)."""
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

from ._aliases import BODY_CONFIG

# Защитный потолок, а не правило: самый длинный абзац библиотеки — около 47 тыс. знаков.
MAX_TEXT_LENGTH = 200_000
MAX_MESSAGES = 100
# Хоть один не пробельный знак: пустое или из одних пробелов Claude отклонит уже после ответа 200.
_NOT_BLANK = r"\S"


class TranslateMessage(BaseModel):
    model_config = BODY_CONFIG

    role: Literal["user", "assistant"]
    text: str = Field(max_length=MAX_TEXT_LENGTH, pattern=_NOT_BLANK)


class TranslateChatBody(BaseModel):
    """История — без первого сообщения: его собирает сервер из книги, абзаца и выделенного."""
    model_config = BODY_CONFIG

    book_id: int
    selected_text: str = Field(max_length=MAX_TEXT_LENGTH, pattern=_NOT_BLANK)
    paragraph: str = Field(max_length=MAX_TEXT_LENGTH)
    messages: list[TranslateMessage] = Field(max_length=MAX_MESSAGES)
    target_language: Literal["ru", "en"]

    @model_validator(mode="after")
    def history_alternates(self) -> Self:
        """Первое сообщение — от человека (его собирает сервер), поэтому история начинается ответом
        модели, идёт по очереди и кончается вопросом: иначе Claude отклонит запрос уже после 200."""
        expected = ["assistant", "user"] * (len(self.messages) // 2 + 1)
        if [m.role for m in self.messages] != expected[:len(self.messages)] or len(self.messages) % 2:
            raise ValueError("messages must alternate assistant/user and end with user")
        return self
