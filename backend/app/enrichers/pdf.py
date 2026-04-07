import logging
import re
from ..parsers import ParsedMetadata
from .pdf_llm import extract_metadata_from_filename
from .pdf_render import render_cover
from .cover_fetcher import fetch_cover

log = logging.getLogger(__name__)


def _normalize_year(raw: str) -> str | None:
    if not raw:
        return None
    m = re.search(r"\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b", raw)
    return m.group(1) if m else None


def _normalize_isbn(raw: str) -> str | None:
    if not raw:
        return None
    digits = re.sub(r"[^\dXx]", "", raw)
    if len(digits) in (10, 13):
        return digits
    return None


def enrich_pdf(meta: ParsedMetadata, original_filename: str, file_path: str) -> ParsedMetadata:
    """Enrich PDF metadata via LLM filename extraction + cover fetch/render."""
    filename_hint = original_filename or file_path.rsplit("/", 1)[-1]
    llm = extract_metadata_from_filename(filename_hint)

    meta.title = llm.title or meta.title
    meta.authors = list(llm.authors) if llm.authors else meta.authors
    meta.publisher = (llm.publisher or "").strip() or None
    meta.pub_date = _normalize_year(llm.year)
    meta.isbn = _normalize_isbn(llm.isbn)
    meta.description = llm.annotation or None
    # LLM returns human-readable genre names, no need for resolve_tag_names
    meta.genres = list(llm.genres) if llm.genres else meta.genres

    # Cover: try LLM cover_url first, fallback to first page render
    if llm.cover_url:
        cover_bytes, cover_ext = fetch_cover(llm.cover_url)
        if cover_bytes:
            meta.cover_data = cover_bytes
            meta.cover_ext = cover_ext

    if not meta.cover_data:
        cover_bytes, cover_ext = render_cover(file_path)
        if cover_bytes:
            meta.cover_data = cover_bytes
            meta.cover_ext = cover_ext

    # Title fallback
    if not meta.title:
        name = filename_hint.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        meta.title = name

    return meta
