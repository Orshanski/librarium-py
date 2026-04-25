import re
import logging
import requests
from . import MetadataResult
from ..dtos.similar import SimilarCandidate

log = logging.getLogger(__name__)

API_BASE = "https://api.litres.ru/foundation/api"
API_URL = f"{API_BASE}/search"
ARTS_URL = f"{API_BASE}/arts/{{}}"
SIMILAR_URL = f"{API_BASE}/arts/{{}}/similar"
META_URL = "https://www.litres.ru"
COVER_BASE = "https://cv5.litres.ru"
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


def _extract_authors(persons: list[dict]) -> list[str]:
    """Only role in ('author', 'автор', '') → full_name/fullName/name. Empty names are dropped.
    Defensive to non-list input (API may drift) — anything кроме list возвращает []."""
    authors: list[str] = []
    if not isinstance(persons, list):
        return authors
    for p in persons:
        role = (p.get("role") or "").lower()
        name = p.get("full_name") or p.get("fullName") or p.get("name")
        if name and role in ("author", "автор", ""):
            authors.append(name)
    return authors


def _extract_cover_url(item: dict) -> str:
    """item.cover_url or image → absolute URL with META_URL prefix. Empty → ''."""
    cover_rel = item.get("cover_url") or item.get("image") or ""
    return f"{META_URL}{cover_rel}" if cover_rel else ""


def _extract_description(item: dict, detailed: dict | None) -> str:
    """annotation from item (or description). If detailed — replace with html_annotation (if present) and remove ad-paragraphs."""
    description = item.get("annotation") or item.get("description") or ""
    if detailed:
        description = detailed.get("html_annotation") or description
        description = re.sub(
            r"<p\b[^>]*>(?:(?!</p>).)*?(?:покупк|скачать|загрузить|формат|epub|pdf|fb2)(?:(?!</p>).)*?</p>",
            "", description, flags=re.IGNORECASE | re.DOTALL
        )
    return description


def _extract_tags(detailed: dict | None) -> list[str]:
    """detailed.tags → names with non-empty name field."""
    if not detailed:
        return []
    return [t["name"] for t in detailed.get("tags", []) if t.get("name")]


def _extract_isbn(item: dict) -> str:
    """item.isbn or isbn13 → string without dashes. Empty → ''."""
    isbn = item.get("isbn") or item.get("isbn13") or ""
    if not isbn:
        return ""
    return str(isbn).replace("-", "")


def _extract_pub_date(item: dict) -> str:
    """First occurrence of YYYY in date_written_at / first_published_at / release_date (fallback order)."""
    for dkey in ("date_written_at", "first_published_at", "release_date"):
        value = item.get(dkey)
        if not value:
            continue
        m = re.search(r"(\d{4})", str(value))
        if m:
            return m.group(1)
    return ""


def _build_result(item: dict, detailed: dict | None) -> MetadataResult | None:
    """Pure transformation (item, detailed) → MetadataResult. Returns None if no id or empty title after cleanup."""
    item_id = item.get("id") or item.get("uuid")
    if not item_id:
        return None
    title = (item.get("title") or "").strip()
    if not title:
        return None
    return MetadataResult(
        title=title,
        authors=", ".join(_extract_authors(item.get("persons") or [])),
        description=_extract_description(item, detailed),
        publisher=item.get("publisher") or "",
        pub_date=_extract_pub_date(item),
        isbn=_extract_isbn(item) or _extract_isbn(detailed or {}),
        tags=", ".join(_extract_tags(detailed)),
        source="Litres",
        cover_url=_extract_cover_url(item),
    )


def _process_item(item: dict) -> MetadataResult | None:
    """Enrich item with detailed response from `_get_detailed(id)` and build MetadataResult."""
    item_id = item.get("id") or item.get("uuid")
    if not item_id:
        return None
    detailed = _get_detailed(item_id)
    return _build_result(item, detailed)


def find_litres_id(query: str, title: str) -> int | None:
    """Search Litres for a book and return its ID if title matches."""
    resp = _session.get(API_URL, params={
        "q": query,
        "limit": 5,
        "types": ["text_book"],
    }, headers={"ui-language-code": "ru"}, timeout=TIMEOUT)
    if resp.status_code != 200:
        raise ConnectionError(f"Litres search returned {resp.status_code}")

    items = _extract_items(resp.json())
    title_lower = title.lower()
    for item in items:
        item_title = (item.get("title") or "").lower()
        if title_lower in item_title or item_title in title_lower:
            return item.get("id")
    return None


def fetch_similar(litres_id: int) -> list[SimilarCandidate]:
    """Fetch similar books from Litres, filter and normalize."""
    resp = _session.get(SIMILAR_URL.format(litres_id), params={
        "limit": 24,
        "offset": 0,
    }, headers={"ui-language-code": "ru"}, timeout=TIMEOUT)
    if resp.status_code != 200:
        raise ConnectionError(f"Litres similar returned {resp.status_code}")

    items = resp.json().get("payload", {}).get("data", [])
    results = []
    for item in items:
        if item.get("art_type") not in (0, 4):
            continue

        rating_data = item.get("rating", {})
        rating_avg = float(rating_data.get("rated_avg", 0) or 0.0)
        rating_count = rating_data.get("rated_total_count", 0)
        if rating_count < 5:
            continue

        authors = ", ".join(
            p.get("full_name", "")
            for p in item.get("persons", [])
            if p.get("role", "").lower() in ("author", "")
        )

        cover_rel = item.get("cover_url", "")
        cover_url = f"/api/metadata/cover-proxy?url={COVER_BASE}{cover_rel}" if cover_rel else ""

        results.append({
            "title": item.get("title", ""),
            "authors": authors,
            "cover_url": cover_url,
            "litres_url": f"{META_URL}{item.get('url', '')}",
            "rating": round(rating_avg, 1),
            "rating_count": rating_count,
        })

    # Sort by rating desc, no limit — show all that passed filters
    results.sort(key=lambda r: r["rating"], reverse=True)
    return results


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
