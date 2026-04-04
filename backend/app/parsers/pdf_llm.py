import json
import logging
from dataclasses import dataclass
import anthropic
from ..config import ANTHROPIC_API_KEY

log = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 2000
TIMEOUT_SEC = 30.0

SYSTEM_PROMPT = """Ты — помощник библиотекаря. На вход получаешь имя PDF-файла книги.
Используй web search, чтобы найти полные выходные данные книги.

Верни JSON:
{
  "title": "...",
  "author": "...",
  "publisher": "...",
  "year": "...",
  "isbn": "...",
  "annotation": "...",
  "genre": "...",
  "cover_url": "..."
}

Правила:
- Если не нашёл книгу — верни пустые строки в соответствующих полях, НЕ придумывай
- author: "Имя Фамилия" (на русском если книга русская), несколько авторов через запятую
- annotation: краткое описание 1-2 предложения
- cover_url: прямая ссылка на изображение обложки (jpg/png)
- Не придумывай имена по инициалам, если не уверен — оставь как есть

Верни только JSON, без markdown и пояснений."""


@dataclass
class LlmMetadata:
    title: str = ""
    author: str = ""
    publisher: str = ""
    year: str = ""
    isbn: str = ""
    annotation: str = ""
    genre: str = ""
    cover_url: str = ""


def extract_metadata_from_filename(filename: str) -> LlmMetadata:
    """Extract book metadata via Claude + web search. Returns empty metadata on any failure."""
    if not ANTHROPIC_API_KEY:
        log.info("ANTHROPIC_API_KEY not set, skipping LLM extraction")
        return LlmMetadata()

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY, timeout=TIMEOUT_SEC)
        response = client.messages.create(
            model=MODEL,
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
        log.warning("LLM metadata extraction failed: %s", e)
        return LlmMetadata()

    # Collect all text blocks
    texts = [b.text for b in response.content if b.type == "text"]
    text = "\n".join(texts).strip()

    # Strip markdown code fences
    if "```" in text:
        parts = text.split("```")
        for i, part in enumerate(parts):
            if i % 2 == 1:  # inside fence
                p = part.strip()
                if p.startswith("json"):
                    p = p[4:].lstrip()
                if p.startswith("{"):
                    text = p
                    break

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        log.warning("LLM returned non-JSON: %s", e)
        return LlmMetadata()

    return LlmMetadata(
        title=data.get("title", "") or "",
        author=data.get("author", "") or "",
        publisher=data.get("publisher", "") or "",
        year=data.get("year", "") or "",
        isbn=data.get("isbn", "") or "",
        annotation=data.get("annotation", "") or "",
        genre=data.get("genre", "") or "",
        cover_url=data.get("cover_url", "") or "",
    )
