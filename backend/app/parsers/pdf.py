import logging
from . import ParsedMetadata
from .pdf_llm import extract_metadata_from_filename
from .pdf_render import render_cover
from .cover_fetcher import fetch_cover

log = logging.getLogger(__name__)


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
    meta.authors = [a.strip() for a in llm.author.split(",") if a.strip()] if llm.author else []
    meta.publisher = llm.publisher or None
    meta.pub_date = llm.year or None
    meta.isbn = llm.isbn or None
    meta.description = llm.annotation or None
    meta.genres = [llm.genre] if llm.genre else []

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
