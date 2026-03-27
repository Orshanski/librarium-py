import re
import logging
import requests
from . import MetadataResult

log = logging.getLogger(__name__)

API_URL = "https://api.litres.ru/foundation/api/search"
ARTS_URL = "https://api.litres.ru/foundation/api/arts/{}"
META_URL = "https://www.litres.ru"
TIMEOUT = 15
LIMIT = 7

_session = requests.Session()
_session.headers.update({
    "User-Agent": "Librarium-Metadata/1.0",
    "Accept": "application/json",
    "Accept-Language": "ru-RU,ru;q=0.9",
})


def search_litres(query: str) -> list[MetadataResult]:
    try:
        resp = _session.get(API_URL, params={
            "q": query.strip(),
            "limit": LIMIT,
            "show_unavailable": "true",
            "types": ["text_book", "audiobook"],
        }, headers={"ui-language-code": "ru"}, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []

        items = _extract_items(resp.json())
        results = []
        for item in items[:LIMIT]:
            r = _process_item(item)
            if r:
                results.append(r)
        return results
    except Exception as e:
        log.warning("Litres search error: %s", e)
        return []


def _extract_items(data: dict) -> list[dict]:
    try:
        payload = data.get("payload", {}).get("data", [])
        if isinstance(payload, list):
            return [el["instance"] for el in payload if isinstance(el, dict) and "instance" in el]
    except Exception:
        pass
    return []


def _process_item(item: dict) -> MetadataResult | None:
    item_id = item.get("id") or item.get("uuid")
    if not item_id:
        return None

    title = (item.get("title") or "").strip()
    # Remove format suffixes like (pdf), (epub)
    title = re.sub(r"\s*\([^)]*(?:pdf|epub|fb2|mobi)[^)]*\)", "", title, flags=re.IGNORECASE)
    if not title:
        return None

    # Authors
    authors = []
    for p in item.get("persons") or []:
        role = (p.get("role") or "").lower()
        name = p.get("full_name") or p.get("fullName") or p.get("name")
        if name and role in ("author", "автор", ""):
            authors.append(name)

    # Cover
    cover_rel = item.get("cover_url") or item.get("image") or ""
    cover_url = f"{META_URL}{cover_rel}" if cover_rel else ""

    # Description — try to get detailed info
    description = item.get("annotation") or item.get("description") or ""
    detailed = _get_detailed(item_id)
    if detailed:
        description = detailed.get("html_annotation") or description
        # Clean ad paragraphs
        description = re.sub(
            r"<p\b[^>]*>(?:(?!</p>).)*?(?:покупк|скачать|загрузить|формат|epub|pdf|fb2)(?:(?!</p>).)*?</p>",
            "", description, flags=re.IGNORECASE | re.DOTALL
        )

    # Tags
    tags = []
    if detailed:
        tags = [t["name"] for t in detailed.get("tags", []) if t.get("name")]

    # ISBN
    isbn = item.get("isbn") or item.get("isbn13") or ""
    if isbn:
        isbn = str(isbn).replace("-", "")

    # Publisher
    publisher = item.get("publisher") or ""

    # Date
    pub_date = ""
    for dkey in ("date_written_at", "first_published_at", "release_date"):
        if item.get(dkey):
            m = re.search(r"(\d{4})", str(item[dkey]))
            if m:
                pub_date = m.group(1)
                break

    return MetadataResult(
        title=title,
        authors=", ".join(authors),
        description=description,
        publisher=publisher,
        pubDate=pub_date,
        isbn=isbn,
        tags=", ".join(tags),
        source="Litres",
        coverUrl=cover_url,
    )


def _get_detailed(item_id) -> dict | None:
    try:
        resp = _session.get(ARTS_URL.format(item_id), headers={
            "ui-language-code": "ru",
        }, timeout=TIMEOUT)
        if resp.status_code == 200:
            return resp.json().get("payload", {}).get("data", {})
    except Exception:
        pass
    return None
