import json
import logging
import re
from dataclasses import dataclass
import anthropic
from ..config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_TIMEOUT_SEC

log = logging.getLogger(__name__)

MAX_TOKENS = 2000

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


def _extract_json_object(text: str) -> dict | None:
    """Extract first valid JSON object from text, tolerating markdown fences and surrounding prose."""
    if not text:
        return None
    # Try direct parse first
    try:
        result = json.loads(text)
        return result if isinstance(result, dict) else None
    except json.JSONDecodeError:
        pass
    # Find all brace-balanced candidates; try from the first one
    starts = [m.start() for m in re.finditer(r"\{", text)]
    for start in starts:
        depth = 0
        in_string = False
        escape = False
        for i in range(start, len(text)):
            ch = text[i]
            if escape:
                escape = False
                continue
            if ch == "\\" and in_string:
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start:i + 1]
                    try:
                        result = json.loads(candidate)
                        if isinstance(result, dict):
                            return result
                    except json.JSONDecodeError:
                        break  # try next start position
    return None


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
        log.warning("LLM metadata extraction failed: %s", e)
        return LlmMetadata()

    # Collect all text blocks
    texts = [b.text for b in response.content if b.type == "text"]
    text = "\n".join(texts).strip()

    data = _extract_json_object(text)
    if data is None:
        log.warning("LLM returned no parseable JSON: %s", text[:200])
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
