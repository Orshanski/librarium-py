"""Каталог OPDS 2.0: ленты поверх сервисов каталога сайта."""
import sqlite3
from typing import Any, get_args
from urllib.parse import urlencode

from ..config.sort import SORT_CONFIG
from ..dal import books as books_dal
from ..dtos.book_card import BookCardItem
from ..dtos.books import PublicationRow
from ..dtos.catalog import OpdsSort
from ..parsers import language_code
from . import (
    authors_service, book_service, cover_service, filters_service, search_service, series_service,
    tags_service,
)
from .download_service import media_type_for

FEED_TYPE = "application/opds+json"
AUTH_DOCUMENT_TYPE = "application/opds-authentication+json"
_PAGE_SIZE = 50
_SEARCH_LIMIT = 50
_BOOKS_SORTS: tuple[OpdsSort, ...] = get_args(OpdsSort)
_DEFAULT_SORT: OpdsSort = "addedDesc"
_CATALOG_TITLE = "Librarium"
_CATALOG_IDENTIFIER = "urn:librarium:main"
_ACQUISITION = "http://opds-spec.org/acquisition"

_COVER_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp",
}

Feed = dict[str, Any]


def auth_document(document_url: str) -> dict[str, Any]:
    return {
        "id": document_url,
        "title": _CATALOG_TITLE,
        "authentication": [{
            "type": "http://opds-spec.org/auth/oauth/password",
            "links": [{"rel": "authenticate", "href": "/opds/token", "type": "application/json"}],
            "labels": {"login": "Имя пользователя", "password": "Пароль"},
        }],
    }


def _href(path: str, **params: Any) -> str:
    query = urlencode({k: v for k, v in params.items() if v is not None})
    return f"{path}?{query}" if query else path


def _nav(href: str, title: str, count: int | None = None) -> dict[str, Any]:
    link: dict[str, Any] = {"href": href, "title": title, "type": FEED_TYPE}
    if count is not None:
        link["properties"] = {"numberOfItems": count}
    return link


def _feed(title: str, self_href: str, **body: Any) -> Feed:
    """Лента с заголовком и ссылкой self; пустые коллекции не отдаются,
    а без единой коллекции лента получает пустой список групп."""
    feed: Feed = {
        "metadata": {"title": title},
        "links": [{"rel": "self", "href": self_href, "type": FEED_TYPE}],
    }
    collections = {k: v for k, v in body.items() if v}
    if not any(k in collections for k in ("navigation", "publications", "groups")):
        collections["groups"] = []
    feed.update(collections)
    return feed


def _group(title: str, **collection: list) -> list[dict[str, Any]]:
    """Группа из одной коллекции; пустая группа не отдаётся."""
    [(key, items)] = collection.items()
    return [{"metadata": {"title": title}, key: items}] if items else []


# --- Запись о книге ---

def _modified(updated_at: str) -> str:
    return updated_at.replace(" ", "T") + "Z"


def _publication(row: PublicationRow) -> dict[str, Any] | None:
    book_id = row["id"]
    links = []
    for f in row["files"]:
        link: dict[str, Any] = {
            "rel": _ACQUISITION,
            "href": _href(f"/opds/books/{book_id}/download", format=f.format.lower()),
            "type": media_type_for(f.format),
        }
        if f.file_size is not None:
            link["size"] = f.file_size
        links.append(link)
    if not links:
        return None

    metadata: dict[str, Any] = {"title": row["title"], "modified": _modified(row["updated_at"])}
    authors = []
    for a in row["authors"]:
        author: dict[str, Any] = {"name": a.name}
        if a.sort_name:
            author["sortAs"] = a.sort_name
        author["links"] = [{"href": f"/opds/authors/{a.id}", "type": FEED_TYPE}]
        authors.append(author)
    if authors:
        metadata["author"] = authors
    if row["series"] is not None:
        series: dict[str, Any] = {"name": row["series"].name}
        if row["series_number"] is not None:
            series["position"] = row["series_number"]
        series["links"] = [{"href": f"/opds/series/{row['series'].id}", "type": FEED_TYPE}]
        metadata["belongsTo"] = {"series": [series]}
    if row["tags"]:
        metadata["subject"] = [
            {"name": t.name, "links": [{"href": f"/opds/genres/{t.id}", "type": FEED_TYPE}]}
            for t in row["tags"]
        ]
    language = language_code(row["language"])
    if language:
        metadata["language"] = language
    for key, value in (
        ("publisher", row["publisher"]),
        ("description", row["description"]),
        ("published", row["pub_date"]),
        ("identifier", f"urn:isbn:{row['isbn']}" if row["isbn"] else None),
    ):
        if value:
            metadata[key] = value

    publication: dict[str, Any] = {"metadata": metadata, "links": links}
    if row["cover_path"]:
        t = row["updated_at"]
        ext = row["cover_path"].rsplit(".", 1)[-1].lower()
        thumb: dict[str, Any] = {"href": _href(f"/opds/covers/{book_id}", t=t), "type": "image/jpeg"}
        full: dict[str, Any] = {"href": _href(f"/opds/covers/{book_id}", full=1, t=t),
                                "type": _COVER_TYPES.get(ext, "image/jpeg")}
        size = cover_service.cover_size(book_id)
        if size is not None:
            thumb["width"], thumb["height"] = cover_service.thumb_size(*size)
            full["width"], full["height"] = size
        publication["images"] = [thumb, full]
    return publication


def _publications(db: sqlite3.Connection, cards: list[BookCardItem]) -> list[dict[str, Any]]:
    """Записи о книгах в порядке списка сайта. Книга без файлов не отдаётся:
    запись OPDS обязана нести ссылку на скачивание."""
    rows = books_dal.get_publication_rows(db, [c.id for c in cards])
    publications = (_publication(rows[c.id]) for c in cards if c.id in rows)
    return [p for p in publications if p is not None]


# --- Листание ---

def _paged_feed(
    db: sqlite3.Connection,
    title: str,
    path: str,
    params: dict[str, Any],
    page: int,
    cards: list[BookCardItem],
    has_more: bool,
    **extra: Any,
) -> Feed:
    def page_href(n: int) -> str:
        return _href(path, **params, page=n if n > 1 else None)

    feed = _feed(title, page_href(page), publications=_publications(db, cards), **extra)
    feed["metadata"].update(itemsPerPage=_PAGE_SIZE, currentPage=page)
    feed["links"].append({"rel": "first", "href": page_href(1), "type": FEED_TYPE})
    if page > 1:
        feed["links"].append({"rel": "previous", "href": page_href(page - 1), "type": FEED_TYPE})
    if has_more:
        feed["links"].append({"rel": "next", "href": page_href(page + 1), "type": FEED_TYPE})
    return feed


# --- Ленты ---

def root_feed() -> Feed:
    feed = _feed(_CATALOG_TITLE, "/opds/", navigation=[
        _nav("/opds/books", "Все книги"),
        _nav("/opds/authors", "Авторы"),
        _nav("/opds/series", "Серии"),
        _nav("/opds/genres", "Жанры"),
    ])
    feed["metadata"]["identifier"] = _CATALOG_IDENTIFIER
    feed["links"].append(
        {"rel": "search", "href": "/opds/search{?query}", "type": FEED_TYPE, "templated": True}
    )
    return feed


def books_feed(db: sqlite3.Connection, user_id: int, sort: OpdsSort, language: str | None, page: int) -> Feed:
    listing = book_service.list_books(
        db, user_id, sort=sort, cursor=(page - 1) * _PAGE_SIZE, page_size=_PAGE_SIZE,
        author_ids=None, tag_ids=None, series_ids=None,
        language=[language] if language else None,
    )
    sort_param = sort if sort != _DEFAULT_SORT else None

    def facet(title: str, href: str, active: bool) -> dict[str, Any]:
        link: dict[str, Any] = {"href": href, "title": title, "type": FEED_TYPE}
        if active:
            link["rel"] = "self"
        return link

    labels = SORT_CONFIG["labels"]
    sort_links = [
        facet(labels[key], _href("/opds/books", sort=key if key != _DEFAULT_SORT else None, language=language),
              key == sort)
        for key in _BOOKS_SORTS
    ]
    languages = filters_service.list_language_options(db, user_id, {}).languages
    language_links = [facet("Все", _href("/opds/books", sort=sort_param), language is None)] + [
        facet(lang["name"], _href("/opds/books", sort=sort_param, language=lang["name"]),
              lang["name"] == language)
        for lang in languages
    ]
    return _paged_feed(
        db, "Все книги", "/opds/books", {"sort": sort_param, "language": language}, page,
        listing.books, listing.has_more,
        facets=[
            {"metadata": {"title": "Сортировка"}, "links": sort_links},
            {"metadata": {"title": "Язык"}, "links": language_links},
        ],
    )


def authors_feed(db: sqlite3.Connection, user_id: int) -> Feed:
    authors = authors_service.list_authors(db, user_id, tag_ids=None, language=None).authors
    return _feed("Авторы", "/opds/authors", navigation=[
        _nav(f"/opds/authors/{a['id']}", a["name"], a["book_count"]) for a in authors
    ])


def author_feed(db: sqlite3.Connection, user_id: int, author_id: int) -> Feed:
    detail = authors_service.get_author(db, author_id, user_id)
    series = series_service.list_series(db, user_id, author_ids=[author_id], tag_ids=None, language=None).series
    return _feed(detail.author["name"], f"/opds/authors/{author_id}", groups=[
        *_group("Серии", navigation=[
            _nav(f"/opds/series/{s['id']}", s["name"], s["book_count"]) for s in series
        ]),
        *_group("Книги", publications=_publications(db, [b for b in detail.books if b.series is None])),
    ])


def series_list_feed(db: sqlite3.Connection, user_id: int) -> Feed:
    series = series_service.list_series(db, user_id, author_ids=None, tag_ids=None, language=None).series
    return _feed("Серии", "/opds/series", navigation=[
        _nav(f"/opds/series/{s['id']}", s["name"], s["book_count"]) for s in series
    ])


def series_feed(db: sqlite3.Connection, user_id: int, series_id: int) -> Feed:
    detail = series_service.get_series(db, series_id, user_id)
    return _feed(detail.series["name"], f"/opds/series/{series_id}",
                 publications=_publications(db, detail.books))


def genres_feed(db: sqlite3.Connection) -> Feed:
    tags = sorted(tags_service.tag_cloud(db, None).tags, key=lambda t: t["name"].casefold())
    return _feed("Жанры", "/opds/genres", navigation=[
        _nav(f"/opds/genres/{t['id']}", t["name"], t["book_count"]) for t in tags
    ])


def genre_feed(db: sqlite3.Connection, user_id: int, tag_id: int, page: int) -> Feed:
    name = tags_service.get_tag_name(db, tag_id)
    listing = book_service.list_books(
        db, user_id, sort=SORT_CONFIG["catalog"]["default"], cursor=(page - 1) * _PAGE_SIZE,
        page_size=_PAGE_SIZE, author_ids=None, tag_ids=[tag_id], series_ids=None, language=None,
    )
    return _paged_feed(db, name, f"/opds/genres/{tag_id}", {}, page, listing.books, listing.has_more)


def search_feed(db: sqlite3.Connection, user_id: int, query: str) -> Feed:
    result = search_service.search(db, query, _SEARCH_LIMIT, user_id=user_id)
    q = query.strip()
    return _feed(f"Поиск: {q}" if q else "Поиск", _href("/opds/search", query=q or None), groups=[
        *_group("Авторы", navigation=[
            _nav(f"/opds/authors/{a['id']}", a["name"], a["book_count"]) for a in result.authors
        ]),
        *_group("Серии", navigation=[
            _nav(f"/opds/series/{s['id']}", s["name"], s["book_count"]) for s in result.series
        ]),
        *_group("Книги", publications=_publications(db, result.books)),
    ])
