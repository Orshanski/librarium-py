from collections.abc import Callable
from ..parsers import ParsedMetadata

_ENRICHERS: dict[str, Callable] = {}


def _init_enrichers():
    from .pdf import enrich_pdf
    _ENRICHERS["pdf"] = enrich_pdf


def _resolve_genres(raw_genres: list[str]) -> list[str]:
    """Resolve genre names/codes via tag_mappings.

    Uses _get_db() directly because enrich_metadata runs in asyncio.to_thread
    (different thread from the request handler), so the request's db connection
    cannot be shared here.
    """
    from ..dal.tags import resolve_tag_names
    from ..database import _get_db
    db = _get_db()
    return resolve_tag_names(db, raw_genres)


def enrich_metadata(meta: ParsedMetadata, ext: str, original_filename: str, file_path: str) -> ParsedMetadata:
    """Enrich parsed metadata with external sources (LLM, cover search, etc.)."""
    ext = ext.lower().lstrip(".")
    if not _ENRICHERS:
        _init_enrichers()
    enricher = _ENRICHERS.get(ext)
    if enricher:
        meta = enricher(meta, original_filename, file_path)
    meta.genres = _resolve_genres(meta.genres)
    return meta
