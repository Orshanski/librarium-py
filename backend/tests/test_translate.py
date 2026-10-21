"""Перевод выделенного: подсказка, первое сообщение, поток событий, вызов Claude, эндпоинт."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.dtos._refs import AuthorRef
from app.providers import claude_chat
from app.services import translate_service

URL = "/api/translate/chat"


def _parse_sse(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.strip().split("\n\n"):
        lines = block.split("\n")
        name = next(line[len("event: "):] for line in lines if line.startswith("event: "))
        data_lines = [line[len("data: "):] for line in lines if line.startswith("data: ")]
        assert len(data_lines) == 1, f"данные события — одной строкой: {block!r}"
        events.append((name, json.loads(data_lines[0])))
    return events


def _body(book_id: int, **overrides) -> dict:
    body = {
        "bookId": book_id,
        "selectedText": "a few",
        "paragraph": "There were a few of them.\nSecond line.",
        "messages": [],
        "targetLanguage": "ru",
    }
    body.update(overrides)
    return body


@pytest.fixture
def book_id(db) -> int:
    return db.execute("SELECT id FROM books ORDER BY id LIMIT 1").fetchone()["id"]


@pytest.fixture
def fake_stream(monkeypatch):
    """Подменяет вызов Claude: отдаёт заданные куски и запоминает, с чем его позвали."""
    calls: list[dict] = []
    script: dict = {"chunks": ["Их ", "было\nнесколько."], "raise": None}

    async def stream_text(*, system, messages):
        calls.append({"system": system, "messages": messages})
        for chunk in script["chunks"]:
            yield chunk
        if script["raise"] is not None:
            raise script["raise"]

    monkeypatch.setattr(translate_service.claude_chat, "stream_text", stream_text)
    monkeypatch.setattr(translate_service, "ANTHROPIC_API_KEY", "test-key")
    return SimpleNamespace(calls=calls, script=script)


# --- Подсказка ---------------------------------------------------------------


def test_system_prompt_ru_names_russian_in_all_three_places():
    prompt = translate_service.system_prompt("ru")
    assert "перевод выделенного фрагмента на русский" in prompt
    assert "Если фрагмент уже на русском" in prompt
    assert "Отвечай по-русски" in prompt
    assert "английск" not in prompt


def test_system_prompt_en_names_english_in_all_three_places():
    prompt = translate_service.system_prompt("en")
    assert "перевод выделенного фрагмента на английский" in prompt
    assert "Если фрагмент уже на английском" in prompt
    assert "Отвечай по-английски" in prompt
    assert "русск" not in prompt


def test_system_prompt_keeps_separator_and_precision_rules():
    prompt = translate_service.system_prompt("ru")
    assert "три дефиса ---" in prompt
    assert "Не добавляй того, чего в оригинале нет" in prompt


# --- Первое сообщение ----------------------------------------------------------


def _book(**overrides) -> dict:
    book = {"title": "Дюна", "authors": [AuthorRef(id=1, name="Фрэнк Герберт")], "language": "English"}
    book.update(overrides)
    return book


def test_opening_message_has_book_language_paragraph_and_selection():
    text = translate_service.opening_message(_book(), paragraph="P1\nP2", selected_text="sel")
    assert text == (
        "Книга: «Дюна», автор: Фрэнк Герберт.\n"
        "Язык книги: English\n"
        "\n"
        "Абзац:\n"
        "P1\nP2\n"
        "\n"
        "Выделено:\n"
        "sel"
    )


def test_opening_message_without_language_has_no_language_line():
    for empty in (None, ""):
        text = translate_service.opening_message(_book(language=empty), paragraph="P", selected_text="s")
        assert "Язык книги" not in text
        assert text.startswith("Книга: «Дюна», автор: Фрэнк Герберт.\n\nАбзац:\n")


def test_opening_message_joins_authors_and_drops_author_part_when_none():
    two = _book(authors=[AuthorRef(id=1, name="А"), AuthorRef(id=2, name="Б")])
    assert translate_service.opening_message(two, "P", "s").startswith("Книга: «Дюна», автор: А, Б.\n")
    nobody = _book(authors=[])
    assert translate_service.opening_message(nobody, "P", "s").startswith("Книга: «Дюна».\n")


# --- Эндпоинт: ошибки до потока ---------------------------------------------------


def test_translate_requires_login(anon_client, book_id):
    assert anon_client.post(URL, json=_body(book_id)).status_code == 401


def test_translate_requires_csrf_header(reader_client, book_id):
    del reader_client.headers["X-Requested-With"]
    assert reader_client.post(URL, json=_body(book_id)).status_code == 403


def test_translate_unknown_book_is_404(reader_client, fake_stream):
    resp = reader_client.post(URL, json=_body(999999))
    assert resp.status_code == 404
    assert fake_stream.calls == []


def test_translate_without_api_key_is_502(reader_client, book_id, fake_stream, monkeypatch):
    monkeypatch.setattr(translate_service, "ANTHROPIC_API_KEY", "")
    resp = reader_client.post(URL, json=_body(book_id))
    assert resp.status_code == 502
    assert fake_stream.calls == []


@pytest.mark.parametrize("overrides", [
    {"targetLanguage": "de"},
    {"selectedText": ""},
    {"selected_text": "snake"},
    {"extra": 1},
    {"messages": [{"role": "system", "text": "x"}]},
    {"messages": [{"role": "user", "content": "x"}]},
    {"messages": [{"role": "user", "text": "x", "extra": 1}]},
    {"selectedText": "x" * 200_001},
    {"paragraph": "x" * 200_001},
    {"messages": [{"role": "user", "text": "x"}] * 101},
    {"messages": [{"role": "user", "text": "x" * 200_001}]},
])
def test_translate_rejects_bad_body(reader_client, book_id, fake_stream, overrides):
    resp = reader_client.post(URL, json=_body(book_id, **overrides))
    assert resp.status_code == 422
    assert fake_stream.calls == []


def test_translate_accepts_limits_exactly(reader_client, book_id, fake_stream):
    body = _body(
        book_id,
        selectedText="x" * 200_000,
        paragraph="x" * 200_000,
        messages=[{"role": "user", "text": "x" * 200_000}] + [{"role": "assistant", "text": "y"}] * 99,
    )
    assert reader_client.post(URL, json=body).status_code == 200


# --- Эндпоинт: поток -----------------------------------------------------------------


def test_translate_streams_deltas_then_done(reader_client, book_id, fake_stream):
    resp = reader_client.post(URL, json=_body(book_id))
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    assert resp.headers["x-accel-buffering"] == "no"
    assert _parse_sse(resp.text) == [
        ("delta", {"text": "Их "}),
        ("delta", {"text": "было\nнесколько."}),
        ("done", {}),
    ]


def test_translate_sends_prompt_opening_and_history(reader_client, book_id, fake_stream, db):
    title = db.execute("SELECT title FROM books WHERE id = ?", (book_id,)).fetchone()["title"]
    history = [
        {"role": "assistant", "text": "Их было несколько."},
        {"role": "user", "text": "Почему так?"},
    ]
    reader_client.post(URL, json=_body(book_id, messages=history, targetLanguage="en"))
    [call] = fake_stream.calls
    assert call["system"] == translate_service.system_prompt("en")
    first, *rest = call["messages"]
    assert first["role"] == "user"
    assert first["content"].startswith(f"Книга: «{title}»")
    assert first["content"].endswith("Абзац:\nThere were a few of them.\nSecond line.\n\nВыделено:\na few")
    assert rest == [
        {"role": "assistant", "content": "Их было несколько."},
        {"role": "user", "content": "Почему так?"},
    ]


def test_translate_refusal_ends_with_error_not_done(reader_client, book_id, fake_stream):
    fake_stream.script["raise"] = claude_chat.ModelRefusal()
    events = _parse_sse(reader_client.post(URL, json=_body(book_id)).text)
    assert events[-1] == ("error", {"message": translate_service.REFUSAL_MESSAGE})
    assert ("done", {}) not in events
    assert events[:2] == [("delta", {"text": "Их "}), ("delta", {"text": "было\nнесколько."})]


def test_translate_api_failure_ends_with_generic_error(reader_client, book_id, fake_stream, caplog):
    fake_stream.script["chunks"] = []
    fake_stream.script["raise"] = RuntimeError("overloaded\nFORGED line")
    with caplog.at_level("WARNING", logger="librarium.translate"):
        events = _parse_sse(reader_client.post(URL, json=_body(book_id)).text)
    assert events == [("error", {"message": translate_service.FAILURE_MESSAGE})]
    message = next(r.getMessage() for r in caplog.records if r.name == "librarium.translate")
    assert "overloaded\\nFORGED line" in message


# --- Вызов Claude ----------------------------------------------------------------


class _FakeAnthropicStream:
    def __init__(self, chunks, stop_reason):
        self._chunks = chunks
        self._stop_reason = stop_reason
        self.closed = False

    async def __aenter__(self):
        async def texts():
            for chunk in self._chunks:
                yield chunk
        self.text_stream = texts()
        return self

    async def __aexit__(self, *exc):
        self.closed = True
        return False

    async def get_final_message(self):
        return SimpleNamespace(stop_reason=self._stop_reason)


def _run_provider(stream_obj, **kwargs):
    client = MagicMock()
    client.beta.messages.stream.return_value = stream_obj

    async def collect():
        return [chunk async for chunk in claude_chat.stream_text(**kwargs)]

    with patch("app.providers.claude_chat.anthropic.AsyncAnthropic", return_value=client) as ctor:
        result = asyncio.run(collect())
    return result, client, ctor


def test_provider_yields_text_and_passes_model_settings():
    stream_obj = _FakeAnthropicStream(["a", "b"], "end_turn")
    messages = [{"role": "user", "content": "hi"}]
    result, client, ctor = _run_provider(stream_obj, system="SYS", messages=messages)
    assert result == ["a", "b"]
    assert stream_obj.closed
    kwargs = client.beta.messages.stream.call_args.kwargs
    assert kwargs == {
        "model": "claude-opus-5-5",
        "max_tokens": 8000,
        "system": "SYS",
        "messages": messages,
        "output_config": {"effort": "low"},
        "fallbacks": "default",
        "betas": ["server-side-fallback-2026-07-01"],
    }
    assert ctor.call_args.kwargs["api_key"] == claude_chat.ANTHROPIC_API_KEY


def test_provider_raises_on_refusal_after_text():
    stream_obj = _FakeAnthropicStream(["part"], "refusal")
    seen: list[str] = []

    async def collect():
        async for chunk in claude_chat.stream_text(system="S", messages=[]):
            seen.append(chunk)

    client = MagicMock()
    client.beta.messages.stream.return_value = stream_obj
    with patch("app.providers.claude_chat.anthropic.AsyncAnthropic", return_value=client):
        with pytest.raises(claude_chat.ModelRefusal):
            asyncio.run(collect())
    assert seen == ["part"]
    assert stream_obj.closed
