"""Перевод выделенного в читалке: подсказка, первое сообщение и поток событий ответа."""
import json
import logging
import sqlite3
from collections.abc import AsyncIterator

from anthropic.types.beta import BetaMessageParam

from ..config import ANTHROPIC_API_KEY
from ..dal import books as books_dal
from ..dtos.books import BookListRow
from ..dtos.translate import TranslateChatBody
from ..exceptions import NotFoundError, UpstreamError
from ..logging_utils import safe as safe_log
from ..providers import claude_chat

log = logging.getLogger("librarium.translate")

REFUSAL_MESSAGE = "Модель отказалась отвечать на этот запрос."
FAILURE_MESSAGE = "Не удалось получить ответ. Попробуйте ещё раз."

# Язык перевода в трёх местах подсказки: «на ...», «уже на ...», «отвечай ...».
_LANGUAGE_FORMS = {
    "ru": ("на русский", "на русском", "по-русски"),
    "en": ("на английский", "на английском", "по-английски"),
}

_SYSTEM_PROMPT = """\
Ты помогаешь человеку читать книгу. Он выделил фрагмент текста; тебе дан абзац, в котором фрагмент стоит, и сведения о книге.

Первым ответом дай литературный перевод выделенного фрагмента {into} — так, как его перевёл бы хороший переводчик художественной литературы, с учётом абзаца и книги. Только перевод: без вступлений и без повтора оригинала. Если фрагмент уже {already} — коротко его смысл.

Переводи точно: литературно, но близко к тексту. Не добавляй того, чего в оригинале нет, — имён, названий, деталей и пояснений из своего знания книги или цикла; не опускай и не пересказывай. Если без знания книги смысл неясен, оставь перевод точным, а пояснение вынеси под разделитель.

Если во фрагменте есть идиома, игра слов, отсылка или реалия, которая теряется в переводе, после перевода поставь отдельной строкой три дефиса --- и ниже коротко поясни. Если пояснять нечего — после перевода ничего не пиши, и разделитель не ставь.

Дальше человек может задавать уточняющие вопросы. Отвечай {answer}, коротко и по делу, без разделителя. Не пересказывай сюжет дальше того абзаца, который тебе дан."""


def system_prompt(target_language: str) -> str:
    into, already, answer = _LANGUAGE_FORMS[target_language]
    return _SYSTEM_PROMPT.format(into=into, already=already, answer=answer)


def opening_message(book: BookListRow, paragraph: str, selected_text: str) -> str:
    """Человеку не показывается: окно читалки цитирует только выделенное."""
    names = ", ".join(author.name for author in book["authors"])
    author = f", автор: {names}" if names else ""
    language = book.get("language")
    language_line = f"Язык книги: {language}\n" if language else ""
    return (
        f"Книга: «{book['title']}»{author}.\n"
        f"{language_line}"
        f"\nАбзац:\n{paragraph}\n"
        f"\nВыделено:\n{selected_text}"
    )


def prepare_chat(
    db: sqlite3.Connection, user_id: int, body: TranslateChatBody
) -> tuple[str, list[BetaMessageParam]]:
    """Подсказка и сообщения для Claude. Ошибки здесь уходят обычным ответом, до начала потока."""
    if not ANTHROPIC_API_KEY:
        raise UpstreamError("Translation is not configured")
    book = books_dal.get_book_by_id(db, body.book_id, user_id)
    if not book:
        raise NotFoundError("Not found")
    opening = opening_message(book, body.paragraph, body.selected_text)
    history: list[BetaMessageParam] = [{"role": m.role, "content": m.text} for m in body.messages]
    return system_prompt(body.target_language), [{"role": "user", "content": opening}, *history]


def _event(name: str, payload: dict) -> str:
    # Данные — JSON одной строкой: сырой текст с переводами строк порвал бы строку `data:`.
    return f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"


async def chat_events(system: str, messages: list[BetaMessageParam]) -> AsyncIterator[str]:
    """Статус 200 уже ушёл с первым куском, поэтому любая беда дальше — событие `error`, а не код."""
    try:
        async for text in claude_chat.stream_text(system=system, messages=messages):
            yield _event("delta", {"text": text})
    except claude_chat.ModelRefusal:
        yield _event("error", {"message": REFUSAL_MESSAGE})
        return
    except Exception as e:
        log.warning("Translate stream failed: %s", safe_log(e))
        yield _event("error", {"message": FAILURE_MESSAGE})
        return
    yield _event("done", {})
