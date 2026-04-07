from collections.abc import Callable
from dataclasses import dataclass, field

_LANGUAGE_MAP: dict[str, str] = {
    "ru": "Русский",
    "русский": "Русский",
    "en": "English",
    "english": "English",
    "fr": "Français",
    "français": "Français",
    "pl": "Polski",
    "polski": "Polski",
}


def normalize_language(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.strip().lower().split("-")[0]
    return _LANGUAGE_MAP.get(key, raw.strip())


@dataclass
class ParsedMetadata:
    title: str = ""
    authors: list[str] = field(default_factory=list)
    series: str | None = None
    series_number: float | None = None
    description: str | None = None
    language: str | None = None
    genres: list[str] = field(default_factory=list)
    publisher: str | None = None
    pub_date: str | None = None
    isbn: str | None = None
    cover_data: bytes | None = None
    cover_ext: str | None = None


def _resolve_genres(raw_genres: list[str]) -> list[str]:
    """Resolve raw genre codes to human-readable tag names via tag_mappings."""
    from ..dal.tags import resolve_tag_names
    return resolve_tag_names(raw_genres)


_PARSERS: dict[str, Callable] = {}


def _init_parsers():
    from .fb2 import parse_fb2
    from .epub import parse_epub
    _PARSERS["fb2"] = parse_fb2
    _PARSERS["epub"] = parse_epub


def parse_book(file_path: str, ext: str) -> ParsedMetadata:
    """Parse book file and resolve genres. For formats without a parser (e.g. PDF),
    returns minimal metadata with title from filename — enrichers handle the rest."""
    ext = ext.lower().lstrip(".")
    if not _PARSERS:
        _init_parsers()
    parser = _PARSERS.get(ext)
    if parser:
        meta = parser(file_path)
    else:
        meta = ParsedMetadata(title=file_path.rsplit("/", 1)[-1].rsplit(".", 1)[0])
    meta.genres = _resolve_genres(meta.genres)
    return meta
