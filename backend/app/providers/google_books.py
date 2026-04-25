import logging

import requests

from . import MetadataResult

log = logging.getLogger(__name__)

SEARCH_URL = "https://www.googleapis.com/books/v1/volumes"
TIMEOUT = 10


def search_google(query: str) -> list[MetadataResult]:
    try:
        resp = requests.get(SEARCH_URL, params={"q": query.strip()}, timeout=TIMEOUT)
        if resp.status_code != 200:
            return []

        results = []
        for item in resp.json().get("items", [])[:7]:
            r = _parse_item(item)
            if r:
                results.append(r)
        return results
    except Exception as e:
        log.warning("Google Books search error: %s", e)
        return []


def _parse_item(item: dict) -> MetadataResult | None:
    info = item.get("volumeInfo", {})
    title = info.get("title", "")
    if not title:
        return None

    authors = ", ".join(info.get("authors", []))

    # Cover
    cover_url = ""
    links = info.get("imageLinks", {})
    if links.get("thumbnail"):
        cover_url = links["thumbnail"].replace("http://", "https://").replace("&edge=curl", "")

    # ISBN
    isbn = ""
    for ident in info.get("industryIdentifiers", []):
        if ident.get("type") == "ISBN_13":
            isbn = ident.get("identifier", "")
            break

    # Date
    pub_date = info.get("publishedDate", "")[:10]

    return MetadataResult(
        title=title,
        authors=authors,
        description=info.get("description", ""),
        publisher=info.get("publisher", ""),
        pub_date=pub_date,
        isbn=isbn,
        tags=", ".join(info.get("categories", [])),
        source="Google Books",
        cover_url=cover_url,
    )
