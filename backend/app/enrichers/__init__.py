from collections.abc import Callable
from ..parsers import ParsedMetadata

_ENRICHERS: dict[str, Callable] = {}


def _init_enrichers():
    from .pdf import enrich_pdf
    _ENRICHERS["pdf"] = enrich_pdf


def _resolve_genres(raw_genres: list[str]) -> list[str]:
    """Resolve genre names/codes via tag_mappings (handles LLM output too)."""
    from ..dal.tags import resolve_tag_names
    return resolve_tag_names(raw_genres)


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
