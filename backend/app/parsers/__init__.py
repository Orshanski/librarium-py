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


def parse_book(file_path: str, ext: str, original_filename: str = "") -> ParsedMetadata:
    ext = ext.lower().lstrip(".")
    if ext == "fb2":
        from .fb2 import parse_fb2
        return parse_fb2(file_path)
    elif ext == "epub":
        from .epub import parse_epub
        return parse_epub(file_path)
    elif ext == "pdf":
        from .pdf import parse_pdf
        return parse_pdf(file_path, original_filename)
    else:
        return ParsedMetadata(title=file_path.rsplit("/", 1)[-1].rsplit(".", 1)[0])
