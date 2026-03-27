from dataclasses import dataclass, asdict


@dataclass
class MetadataResult:
    title: str = ""
    authors: str = ""
    description: str = ""
    publisher: str = ""
    pubDate: str = ""
    isbn: str = ""
    tags: str = ""
    source: str = ""
    coverUrl: str = ""

    def to_dict(self):
        return asdict(self)


def search_metadata(query: str, provider_names: list[str]) -> list[MetadataResult]:
    results = []
    for name in provider_names:
        if name == "litres":
            from .litres import search_litres
            results.extend(search_litres(query))
        elif name == "google":
            from .google_books import search_google
            results.extend(search_google(query))
    return results
