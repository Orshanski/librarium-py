import json
import logging
import re
from dataclasses import dataclass, field
import anthropic
from ..config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_TIMEOUT_SEC
from ..logging_utils import safe as safe_log

log = logging.getLogger(__name__)

MAX_TOKENS = 2000

SYSTEM_PROMPT = """Ты — помощник библиотекаря. На вход получаешь имя PDF-файла книги.
Используй web search, чтобы найти полные выходные данные книги.

Верни JSON:
{
  "title": "...",
  "authors": ["...", "..."],
  "publisher": "...",
  "year": "...",
  "isbn": "...",
  "annotation": "...",
  "genres": ["...", "..."],
  "cover_url": "..."
}

Правила:
- Если не нашёл книгу — верни пустые строки / пустые массивы, НЕ придумывай
- authors: массив строк, каждая строка — один автор в формате "Имя Фамилия" (на русском если книга русская)
- annotation: краткое описание 1-2 предложения
- genres: массив строк, каждая строка — отдельный жанр/категория (например ["Бизнес-литература", "Анализ данных"])
- cover_url: прямая ссылка на изображение обложки (jpg/png)
- Не придумывай имена по инициалам, если не уверен — оставь как есть

Верни только JSON, без markdown и пояснений."""


def _extract_json_object(text: str) -> dict | None:
    """Вырезать первый JSON-object из текста, терпя markdown-обёртки и prose вокруг.

    Использует json.JSONDecoder().raw_decode() — он сам знает escape/string rules
    и возвращает (obj, end_index), игнорируя хвост после валидного объекта.
    """
    if not text:
        return None
    decoder = json.JSONDecoder()
    for m in re.finditer(r"\{", text):
        try:
            result, _ = decoder.raw_decode(text[m.start():])
        except json.JSONDecodeError:
            continue
        if isinstance(result, dict):
            return result
    return None


@dataclass
class LlmMetadata:
    title: str = ""
    authors: list[str] = field(default_factory=list)
    publisher: str = ""
    year: str = ""
    isbn: str = ""
    annotation: str = ""
    genres: list[str] = field(default_factory=list)
    cover_url: str = ""


def _normalize_string_list(value: object) -> list[str]:
    """str → split по запятой; list → map str+strip+filter пустых; иначе → []."""
    if isinstance(value, str):
        return [s.strip() for s in value.split(",") if s.strip()]
    if isinstance(value, list):
        return [str(s).strip() for s in value if str(s).strip()]
    return []


def _call_llm(filename: str) -> str:
    """Anthropic API call с web_search. Возвращает конкатенированный текст или '' при ошибке."""
    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY, timeout=ANTHROPIC_TIMEOUT_SEC)
        response = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            tools=[{
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 3,
            }],
            messages=[{"role": "user", "content": f"Имя файла: {filename}"}],
        )
    except Exception as e:
        log.warning("LLM metadata extraction failed: %s", safe_log(e))
        return ""
    texts = [b.text for b in response.content if b.type == "text"]
    return "\n".join(texts).strip()


def _build_metadata(data: dict) -> LlmMetadata:
    """Собрать LlmMetadata из распарсенного LLM-JSON."""
    raw_genres = data.get("genres") or data.get("genre") or []
    raw_authors = data.get("authors") or data.get("author") or []
    return LlmMetadata(
        title=data.get("title", "") or "",
        authors=_normalize_string_list(raw_authors),
        publisher=data.get("publisher", "") or "",
        year=data.get("year", "") or "",
        isbn=data.get("isbn", "") or "",
        annotation=data.get("annotation", "") or "",
        genres=_normalize_string_list(raw_genres),
        cover_url=data.get("cover_url", "") or "",
    )


def extract_metadata_from_filename(filename: str) -> LlmMetadata:
    """Найти метаданные книги по имени PDF-файла через Claude + web search.
    Возвращает пустой LlmMetadata при любой ошибке (нет ключа / API упал / JSON не распарсился)."""
    if not ANTHROPIC_API_KEY:
        log.info("ANTHROPIC_API_KEY not set, skipping LLM extraction")
        return LlmMetadata()
    text = _call_llm(filename)
    if not text:
        return LlmMetadata()
    data = _extract_json_object(text)
    if data is None:
        log.warning("LLM returned no parseable JSON: %s", safe_log(str(text)))
        return LlmMetadata()
    return _build_metadata(data)
