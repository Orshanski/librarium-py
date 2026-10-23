"""Ленты каталога OPDS: корень, новые поступления, авторы, серии, жанры."""
from urllib.parse import parse_qs, urlsplit

import pytest

from tests._helpers.opds import FEED_TYPE, assert_valid_feed
ACQUISITION = "http://opds-spec.org/acquisition"


@pytest.fixture
def opds(anon_client, opds_headers):
    """Клиент каталога: get(path) с токеном читателя, проверка медиатипа и схемы."""
    headers = opds_headers

    class _Opds:
        @staticmethod
        def get(path, **params):
            # Пустой params стёр бы строку запроса в адресе из ссылки ленты
            resp = anon_client.get(path, params=params or None, headers=headers)
            assert resp.status_code == 200, resp.text
            assert resp.headers["content-type"] == FEED_TYPE
            assert "set-cookie" not in resp.headers
            feed = resp.json()
            assert_valid_feed(feed)
            return feed

        @staticmethod
        def raw(path, **params):
            return anon_client.get(path, params=params, headers=headers)

    return _Opds


@pytest.fixture
def files_for_all_books(db):
    """У книг 3–5 в базовом наборе нет файлов; даём им по fb2, чтобы они попали в ленты."""
    for book_id in (3, 4, 5):
        db.execute(
            "INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (?, 'FB2', ?, 100)",
            (book_id, f"data/library/{book_id}/book.fb2"),
        )
    db.commit()


def _add_books(db, count, *, tag_id=None):
    for i in range(count):
        cur = db.execute(
            "INSERT INTO books (title, sort_title, added_at) VALUES (?, ?, ?)",
            (f"Bulk {i:03d}", f"Bulk {i:03d}", f"2026-01-01 00:{i // 60:02d}:{i % 60:02d}"),
        )
        book_id = cur.lastrowid
        db.execute(
            "INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (?, 'EPUB', ?, 10)",
            (book_id, f"data/library/{book_id}/book.epub"),
        )
        if tag_id is not None:
            db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (?, ?)", (book_id, tag_id))
    db.commit()


def _link(links, rel) -> dict:
    found = [link for link in links if link.get("rel") == rel]
    assert len(found) == 1, f"ссылка {rel!r}: {links}"
    return found[0]


def _rels(links) -> list:
    return [link.get("rel") for link in links]


def _ids(publications):
    return [int(p["links"][0]["href"].split("/")[3]) for p in publications]


def _group(feed, title) -> dict:
    found = [g for g in feed["groups"] if g["metadata"]["title"] == title]
    assert len(found) == 1, f"группа {title!r}: {feed['groups']}"
    return found[0]


def _group_titles(feed) -> list:
    return [g["metadata"]["title"] for g in feed.get("groups", [])]


@pytest.fixture
def site_catch_all():
    """Обработчик адресов SPA, как в main.py при собранном фронтенде:
    в тестах сборки может не быть, а перехват адресов нужен для проверки."""
    from fastapi.responses import PlainTextResponse
    from app.main import app
    before = list(app.router.routes)

    @app.get("/{path:path}")
    def _spa(path: str):
        return PlainTextResponse("SPA")

    yield
    app.router.routes[:] = before


class TestRoot:
    def test_without_slash_redirects_to_canonical_root(self, anon_client, site_catch_all):
        resp = anon_client.get("/opds", follow_redirects=False)
        assert resp.status_code in (307, 308)
        assert resp.headers["location"] == "/opds/"

    def test_navigation_and_search(self, opds):
        feed = opds.get("/opds/")
        assert _link(feed["links"], "self")["href"] == "/opds/"
        assert _link(feed["links"], "search") == {
            "rel": "search", "href": "/opds/search{?query}", "type": FEED_TYPE, "templated": True,
        }
        assert [(n["title"], n["href"]) for n in feed["navigation"]] == [
            ("Новые поступления", "/opds/new"),
            ("Авторы", "/opds/authors"),
            ("Серии", "/opds/series"),
            ("Жанры", "/opds/genres"),
        ]
        assert all(n["type"] == FEED_TYPE for n in feed["navigation"])


class TestPublication:
    def test_full_record(self, opds, db):
        updated_at = db.execute("SELECT updated_at FROM books WHERE id = 1").fetchone()[0]
        size = db.execute("SELECT file_size FROM book_files WHERE book_id = 1").fetchone()[0]
        feed = opds.get("/opds/new")
        pub = next(p for p in feed["publications"] if p["metadata"]["title"] == "Minimal Test Book")
        meta = pub["metadata"]
        assert meta["modified"] == updated_at.replace(" ", "T") + "Z"
        assert meta["author"] == [{
            "name": "Test Author", "sortAs": "Author, Test",
            "links": [{"href": "/opds/authors/1", "type": FEED_TYPE}],
        }]
        assert meta["belongsTo"] == {"series": [{
            "name": "Test Series", "position": 1,
            "links": [{"href": "/opds/series/1", "type": FEED_TYPE}],
        }]}
        assert meta["subject"] == [{"name": "Фэнтези", "links": [{"href": "/opds/genres/1", "type": FEED_TYPE}]}]
        assert meta["language"] == "ru"
        assert meta["publisher"] == "Test Publisher"
        assert meta["published"] == "2025"
        assert meta["identifier"] == "urn:isbn:978-0-000-00001-0"
        assert "description" not in meta
        assert pub["links"] == [{
            "rel": ACQUISITION, "href": "/opds/books/1/download?format=fb2",
            "type": "application/x-fictionbook+xml", "size": size,
        }]
        assert "images" not in pub

    def test_cover_images(self, opds, db):
        updated_at = db.execute("SELECT updated_at FROM books WHERE id = 2").fetchone()[0]
        feed = opds.get("/opds/new")
        pub = next(p for p in feed["publications"] if p["metadata"]["title"] == "Book With Cover")
        t = parse_qs(urlsplit(pub["images"][0]["href"]).query)["t"][0]
        assert t == updated_at
        assert [(urlsplit(i["href"]).path, parse_qs(urlsplit(i["href"]).query).get("full"), i["type"])
                for i in pub["images"]] == [
            ("/opds/covers/2", None, "image/jpeg"),
            ("/opds/covers/2", ["1"], "image/jpeg"),
        ]
        assert pub["metadata"]["language"] == "en"

    def test_language_names_map_to_codes(self, opds, db):
        db.execute("UPDATE books SET language = 'Polski' WHERE id = 1")
        db.execute("UPDATE books SET language = 'Klingon' WHERE id = 2")
        db.commit()
        pubs = {p["metadata"]["title"]: p["metadata"] for p in opds.get("/opds/new")["publications"]}
        assert pubs["Minimal Test Book"]["language"] == "pl"
        assert "language" not in pubs["Book With Cover"]

    def test_published_month_and_full_date_as_in_book(self, opds, db):
        db.execute("UPDATE books SET pub_date = '1999-05' WHERE id = 1")
        db.execute("UPDATE books SET pub_date = '1999-05-12' WHERE id = 2")
        db.commit()
        pubs = {p["metadata"]["title"]: p["metadata"] for p in opds.get("/opds/new")["publications"]}
        assert pubs["Minimal Test Book"]["published"] == "1999-05"
        assert pubs["Book With Cover"]["published"] == "1999-05-12"

    def test_media_type_per_format(self, opds, db):
        db.execute("INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (1, 'EPUB', 'data/library/1/book.epub', NULL)")
        db.execute("INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (1, 'PDF', 'data/library/1/book.pdf', 5)")
        db.commit()
        pub = next(p for p in opds.get("/opds/new")["publications"] if p["metadata"]["title"] == "Minimal Test Book")
        links = {link["href"]: link for link in pub["links"]}
        assert links["/opds/books/1/download?format=epub"] == {
            "rel": ACQUISITION, "href": "/opds/books/1/download?format=epub", "type": "application/epub+zip",
        }
        assert links["/opds/books/1/download?format=pdf"]["type"] == "application/pdf"

    def test_description(self, opds, db):
        db.execute("UPDATE books SET description = 'Про всё' WHERE id = 1")
        db.commit()
        pub = next(p for p in opds.get("/opds/new")["publications"] if p["metadata"]["title"] == "Minimal Test Book")
        assert pub["metadata"]["description"] == "Про всё"


class TestNew:
    def test_newest_first_with_paging_metadata(self, opds, files_for_all_books):
        feed = opds.get("/opds/new")
        assert feed["metadata"]["title"] == "Новые поступления"
        assert feed["metadata"]["itemsPerPage"] == 50
        assert feed["metadata"]["currentPage"] == 1
        assert _ids(feed["publications"]) == [5, 4, 3, 2, 1]
        assert _link(feed["links"], "self")["href"] == "/opds/new"
        assert _link(feed["links"], "first")["href"] == "/opds/new"
        assert "next" not in _rels(feed["links"])
        assert "previous" not in _rels(feed["links"])

    def test_paging(self, opds, db):
        _add_books(db, 55)
        page1 = opds.get("/opds/new")
        assert len(page1["publications"]) == 50
        next_href = _link(page1["links"], "next")["href"]
        assert next_href == "/opds/new?page=2"
        page2 = opds.get(next_href)
        assert page2["metadata"]["currentPage"] == 2
        # 55 новых + книги 1 и 2 с файлами
        assert len(page2["publications"]) == 7
        assert _link(page2["links"], "self")["href"] == "/opds/new?page=2"
        assert _link(page2["links"], "previous")["href"] == "/opds/new"
        assert _link(page2["links"], "first")["href"] == "/opds/new"
        assert "next" not in _rels(page2["links"])

    def test_page_beyond_end_is_empty_feed(self, opds):
        feed = opds.get("/opds/new", page=9)
        assert feed["groups"] == []
        assert "publications" not in feed

    def test_sort_facets(self, opds, files_for_all_books):
        feed = opds.get("/opds/new", sort="titleAsc")
        sort_facet = next(f for f in feed["facets"] if f["metadata"]["title"] == "Сортировка")
        assert [(link["title"], link["href"], link.get("rel")) for link in sort_facet["links"]] == [
            ("По дате добавления (сначала новые)", "/opds/new", None),
            ("По названию А→Я", "/opds/new?sort=titleAsc", "self"),
            ("По автору А→Я", "/opds/new?sort=authorAsc", None),
        ]
        assert _ids(feed["publications"]) == [2, 3, 5, 1, 4]
        assert _ids(opds.get("/opds/new", sort="authorAsc")["publications"]) == [3, 1, 4, 2, 5]

    def test_all_languages_facet_is_active_by_default(self, opds):
        feed = opds.get("/opds/new")
        lang_facet = next(f for f in feed["facets"] if f["metadata"]["title"] == "Язык")
        assert [link.get("rel") for link in lang_facet["links"]] == ["self", None, None]
        assert lang_facet["links"][0]["title"] == "Все"

    def test_language_facet(self, opds, files_for_all_books):
        feed = opds.get("/opds/new", language="en")
        lang_facet = next(f for f in feed["facets"] if f["metadata"]["title"] == "Язык")
        assert [(link["title"], link["href"], link.get("rel")) for link in lang_facet["links"]] == [
            ("Все", "/opds/new", None),
            ("en", "/opds/new?language=en", "self"),
            ("ru", "/opds/new?language=ru", None),
        ]
        assert _ids(feed["publications"]) == [5, 3, 2]

    def test_facets_keep_each_other_and_reset_page(self, opds, db):
        _add_books(db, 55)
        feed = opds.get("/opds/new", sort="titleAsc", page=2)
        lang_facet = next(f for f in feed["facets"] if f["metadata"]["title"] == "Язык")
        assert lang_facet["links"][1]["href"] == "/opds/new?sort=titleAsc&language=en"
        assert _link(feed["links"], "self")["href"] == "/opds/new?sort=titleAsc&page=2"

    def test_book_without_files_is_skipped(self, opds):
        assert _ids(opds.get("/opds/new")["publications"]) == [2, 1]


class TestAuthors:
    def test_list_by_sort_name_with_counts(self, opds):
        feed = opds.get("/opds/authors")
        assert feed["metadata"]["title"] == "Авторы"
        assert _link(feed["links"], "self")["href"] == "/opds/authors"
        assert [(n["title"], n["href"], n["properties"]["numberOfItems"]) for n in feed["navigation"]] == [
            ("Test Author", "/opds/authors/1", 2),
            ("Test Autor", "/opds/authors/3", 1),
            ("Cover Writer", "/opds/authors/2", 2),
        ]

    def test_author_series_group(self, opds):
        feed = opds.get("/opds/authors/1")
        assert feed["metadata"]["title"] == "Test Author"
        assert _link(feed["links"], "self")["href"] == "/opds/authors/1"
        series = _group(feed, "Серии")
        assert series["navigation"] == [{
            "href": "/opds/series/1", "title": "Test Series", "type": FEED_TYPE,
            "properties": {"numberOfItems": 2},
        }]
        assert _group_titles(feed) == ["Серии"]

    def test_author_with_series_and_books_outside(self, opds, db, files_for_all_books):
        db.execute("UPDATE books SET series_id = NULL, series_number = NULL WHERE id = 1")
        db.commit()
        feed = opds.get("/opds/authors/1")
        assert _group_titles(feed) == ["Серии", "Книги"]
        assert _ids(_group(feed, "Книги")["publications"]) == [1]

    def test_author_books_outside_series(self, opds, files_for_all_books):
        feed = opds.get("/opds/authors/2")
        assert _group_titles(feed) == ["Книги"]
        assert _ids(_group(feed, "Книги")["publications"]) == [5, 2]

    def test_unknown_author_is_404(self, opds):
        assert opds.raw("/opds/authors/999").status_code == 404


class TestSeries:
    def test_list_with_counts(self, opds):
        feed = opds.get("/opds/series")
        assert feed["metadata"]["title"] == "Серии"
        assert [(n["title"], n["href"], n["properties"]["numberOfItems"]) for n in feed["navigation"]] == [
            ("Test Series", "/opds/series/1", 2),
            ("Tset Series", "/opds/series/2", 1),
        ]

    def test_books_by_number(self, opds, db, files_for_all_books):
        db.execute("UPDATE books SET series_number = 3 WHERE id = 1")
        db.commit()
        feed = opds.get("/opds/series/1")
        assert feed["metadata"]["title"] == "Test Series"
        assert _link(feed["links"], "self")["href"] == "/opds/series/1"
        assert _ids(feed["publications"]) == [3, 1]

    def test_unknown_series_is_404(self, opds):
        assert opds.raw("/opds/series/999").status_code == 404


class TestGenres:
    def test_alphabetical_with_counts(self, opds):
        feed = opds.get("/opds/genres")
        assert feed["metadata"]["title"] == "Жанры"
        assert [(n["title"], n["href"], n["properties"]["numberOfItems"]) for n in feed["navigation"]] == [
            ("Классический детектив", "/opds/genres/2", 3),
            ("Фэнтези", "/opds/genres/1", 3),
        ]

    def test_genre_books(self, opds, files_for_all_books):
        feed = opds.get("/opds/genres/1")
        assert feed["metadata"]["title"] == "Фэнтези"
        assert feed["metadata"]["currentPage"] == 1
        assert _link(feed["links"], "self")["href"] == "/opds/genres/1"
        assert _ids(feed["publications"]) == [5, 3, 1]

    def test_genre_paging(self, opds, db):
        _add_books(db, 51, tag_id=2)
        page1 = opds.get("/opds/genres/2")
        assert len(page1["publications"]) == 50
        assert _link(page1["links"], "next")["href"] == "/opds/genres/2?page=2"
        page2 = opds.get("/opds/genres/2", page=2)
        assert _link(page2["links"], "previous")["href"] == "/opds/genres/2"
        assert _link(page2["links"], "first")["href"] == "/opds/genres/2"

    def test_empty_genre(self, opds, db):
        db.execute("INSERT INTO tags (id, name) VALUES (3, 'Пустой')")
        db.commit()
        feed = opds.get("/opds/genres/3")
        assert feed["metadata"]["title"] == "Пустой"
        assert feed["groups"] == []

    def test_unknown_genre_is_404(self, opds):
        assert opds.raw("/opds/genres/999").status_code == 404
