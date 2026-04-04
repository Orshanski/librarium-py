import logging
import re
from . import ParsedMetadata
from .pdf_llm import extract_metadata_from_filename
from .pdf_render import render_cover
from .cover_fetcher import fetch_cover

log = logging.getLogger(__name__)


def _normalize_year(raw: str) -> str | None:
    """Extract 4-digit year from LLM output. Returns None if not a plausible year."""
    if not raw:
        return None
    m = re.search(r"\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b", raw)
    return m.group(1) if m else None


def _normalize_isbn(raw: str) -> str | None:
    """Strip hyphens/spaces and validate ISBN-10/13 length. Returns None if invalid."""
    if not raw:
        return None
    digits = re.sub(r"[^\dXx]", "", raw)
    if len(digits) in (10, 13):
        return digits
    return None


def parse_pdf(file_path: str, original_filename: str = "") -> ParsedMetadata:
    """Parse PDF using LLM + web search for metadata, PyMuPDF for cover fallback.

    Args:
        file_path: local filesystem path to the PDF file
        original_filename: user-facing filename (used for LLM extraction hint)
    """
    meta = ParsedMetadata()

    # 1. LLM metadata from filename
    filename_hint = original_filename or file_path.rsplit("/", 1)[-1]
    llm = extract_metadata_from_filename(filename_hint)

    meta.title = llm.title
    meta.authors = list(llm.authors)
    meta.publisher = (llm.publisher or "").strip() or None
    meta.pub_date = _normalize_year(llm.year)
    meta.isbn = _normalize_isbn(llm.isbn)
    meta.description = llm.annotation or None
    meta.genres = list(llm.genres)

    # 2. Cover: try cover_url first, fallback to render
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

    # 3. Title fallback
    if not meta.title:
        name = filename_hint.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        meta.title = name

    return meta
