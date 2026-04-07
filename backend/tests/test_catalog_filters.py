"""Tests for catalog, search, filters, sorting, and options."""


# ── helpers ──

def book_ids(resp_json):
    return {b["id"] for b in resp_json["books"]}


# ── /api/search ──

class TestSearch:
    def test_search_by_title(self, reader_client):
        resp = reader_client.get("/api/search", params={"q": "Minimal"})
        assert resp.status_code == 200
        assert len(resp.json()["books"]) >= 1

    def test_search_by_author(self, reader_client):
        resp = reader_client.get("/api/search", params={"q": "Cover"})
        assert resp.status_code == 200
        assert len(resp.json()["authors"]) >= 1

    def test_search_by_series(self, reader_client):
        resp = reader_client.get("/api/search", params={"q": "Test Series"})
        assert resp.status_code == 200
        assert len(resp.json()["series"]) >= 1

    def test_search_partial_match(self, reader_client):
        resp = reader_client.get("/api/search", params={"q": "Seri"})
        assert resp.status_code == 200
        assert len(resp.json()["series"]) >= 1

    def test_search_empty_query(self, reader_client):
        resp = reader_client.get("/api/search", params={"q": ""})
        assert resp.status_code == 200
        data = resp.json()
        assert data == {"books": [], "authors": [], "series": []}

    def test_search_no_results(self, reader_client):
        resp = reader_client.get("/api/search", params={"q": "xyznonexistent"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["books"] == []
        assert data["authors"] == []
        assert data["series"] == []


# ── Directory endpoints ──

class TestDirectoryEndpoints:
    def test_tags_directory(self, reader_client):
        data = reader_client.get("/api/tags").json()
        assert len(data["tags"]) > 0
        for tag in data["tags"]:
            assert "id" in tag
            assert "name" in tag

    def test_tags_cloud(self, reader_client):
        data = reader_client.get("/api/tags/cloud").json()
        assert len(data["tags"]) > 0
        assert "book_count" in data["tags"][0]

    def test_tags_cloud_top(self, reader_client):
        data = reader_client.get("/api/tags/cloud", params={"top": "1"}).json()
        assert len(data["tags"]) == 1

    def test_languages(self, reader_client):
        data = reader_client.get("/api/languages").json()
        assert {l["name"] for l in data["languages"]} == {"ru", "en"}

    def test_publishers(self, reader_client):
        data = reader_client.get("/api/publishers").json()
        assert "Test Publisher" in data["publishers"]
        assert "Cover Press" in data["publishers"]


# ── /api/books filters ──

class TestBooksFilters:
    def test_no_filters(self, reader_client):
        data = reader_client.get("/api/books").json()
        assert len(data["books"]) == 5

    def test_filter_by_author(self, reader_client):
        data = reader_client.get("/api/books", params={"authorIds": "1"}).json()
        assert book_ids(data) == {1, 3}

    def test_filter_by_tag(self, reader_client):
        data = reader_client.get("/api/books", params={"tagIds": "1"}).json()
        assert book_ids(data) == {1, 3, 5}

    def test_filter_by_series(self, reader_client):
        data = reader_client.get("/api/books", params={"seriesIds": "1"}).json()
        assert book_ids(data) == {1, 3}

    def test_filter_by_language(self, reader_client):
        data = reader_client.get("/api/books", params={"language": "ru"}).json()
        assert book_ids(data) == {1, 4}

    def test_filter_author_and_tag(self, reader_client):
        data = reader_client.get("/api/books", params={"authorIds": "1", "tagIds": "1"}).json()
        assert book_ids(data) == {1, 3}

    def test_filter_author_and_language(self, reader_client):
        data = reader_client.get("/api/books", params={"authorIds": "1", "language": "en"}).json()
        assert book_ids(data) == {3}

    def test_filter_negative_combo(self, reader_client):
        data = reader_client.get("/api/books", params={"seriesIds": "2", "language": "en"}).json()
        assert book_ids(data) == set()

    def test_filter_nonexistent_author(self, reader_client):
        data = reader_client.get("/api/books", params={"authorIds": "999"}).json()
        assert len(data["books"]) == 0

    def test_filter_options_keys(self, reader_client):
        data = reader_client.get("/api/books").json()
        fo = data["filterOptions"]
        assert set(fo.keys()) == {"authors", "series", "tags", "languages"}

    def test_filter_options_dependent(self, reader_client):
        """filterOptions narrow when filters applied (cross-dimension)."""
        all_data = reader_client.get("/api/books").json()
        filtered = reader_client.get("/api/books", params={"authorIds": "1"}).json()
        all_tag_ids = {t["id"] for t in all_data["filterOptions"]["tags"]}
        filt_tag_ids = {t["id"] for t in filtered["filterOptions"]["tags"]}
        assert filt_tag_ids <= all_tag_ids


# ── /api/books sorting ──

class TestBooksSorting:
    def test_sort_title_asc(self, reader_client):
        data = reader_client.get("/api/books", params={"sort": "title_asc"}).json()
        titles = [b["title"] for b in data["books"]]
        expected = ["Book With Cover", "English Fantasy", "Fantasy Detective", "Minimal Test Book", "Русский Детектив"]
        assert titles == expected

    def test_sort_title_desc(self, reader_client):
        data = reader_client.get("/api/books", params={"sort": "title_desc"}).json()
        titles = [b["title"] for b in data["books"]]
        expected = ["Русский Детектив", "Minimal Test Book", "Fantasy Detective", "English Fantasy", "Book With Cover"]
        assert titles == expected

    def test_sort_added_desc(self, reader_client):
        data = reader_client.get("/api/books", params={"sort": "added_desc"}).json()
        assert data["books"][0]["id"] == 5


# ── /api/authors filters ──

class TestAuthorsFilters:
    def test_all_authors(self, reader_client):
        data = reader_client.get("/api/authors").json()
        assert len(data["authors"]) == 3

    def test_filter_by_tag(self, reader_client):
        data = reader_client.get("/api/authors", params={"tagIds": "1"}).json()
        ids = {a["id"] for a in data["authors"]}
        assert ids == {1, 2}

    def test_filter_by_language(self, reader_client):
        data = reader_client.get("/api/authors", params={"language": "ru"}).json()
        ids = {a["id"] for a in data["authors"]}
        assert ids == {1, 3}

    def test_filter_options_present(self, reader_client):
        data = reader_client.get("/api/authors").json()
        assert "filterOptions" in data
        fo = data["filterOptions"]
        assert "tags" in fo
        assert "languages" in fo
        assert len(fo["tags"]) > 0
        assert len(fo["languages"]) > 0
        tag_opt = fo["tags"][0]
        assert "id" in tag_opt
        assert "name" in tag_opt


# ── /api/series filters ──

class TestSeriesFilters:
    def test_all_series(self, reader_client):
        data = reader_client.get("/api/series").json()
        assert len(data["series"]) == 2

    def test_filter_by_author(self, reader_client):
        data = reader_client.get("/api/series", params={"authorIds": "1"}).json()
        ids = {s["id"] for s in data["series"]}
        assert ids == {1}

    def test_filter_by_tag(self, reader_client):
        data = reader_client.get("/api/series", params={"tagIds": "2"}).json()
        ids = {s["id"] for s in data["series"]}
        assert ids == {2}

    def test_filter_by_language(self, reader_client):
        data = reader_client.get("/api/series", params={"language": "en"}).json()
        ids = {s["id"] for s in data["series"]}
        assert ids == {1}

    def test_filter_options_present(self, reader_client):
        data = reader_client.get("/api/series").json()
        fo = data["filterOptions"]
        assert "authors" in fo
        assert "tags" in fo
        assert "languages" in fo
        assert len(fo["authors"]) > 0
        assert len(fo["tags"]) > 0

    def test_series_detail_books_have_series_name(self, reader_client):
        data = reader_client.get("/api/series/1").json()
        books = data["books"]
        assert len(books) == 2
        for b in books:
            assert b["series_name"] == "Test Series"
            assert b["series_number"] is not None


# ── /api/tags ──

class TestTags:
    def test_all_tags(self, reader_client):
        data = reader_client.get("/api/tags").json()
        assert len(data["tags"]) == 2

    def test_tags_directory_no_book_count(self, reader_client):
        data = reader_client.get("/api/tags").json()
        for tag in data["tags"]:
            assert "book_count" not in tag

    def test_tag_detail_books(self, reader_client):
        data = reader_client.get("/api/tags/1").json()
        ids = {b["id"] for b in data["books"]}
        assert ids == {1, 3, 5}

    def test_tag_detail_filter_author(self, reader_client):
        data = reader_client.get("/api/tags/1", params={"authorIds": "1"}).json()
        ids = {b["id"] for b in data["books"]}
        assert ids == {1, 3}

    def test_tag_detail_filter_series(self, reader_client):
        data = reader_client.get("/api/tags/1", params={"seriesIds": "1"}).json()
        ids = {b["id"] for b in data["books"]}
        assert ids == {1, 3}

    def test_tag_detail_filter_language(self, reader_client):
        data = reader_client.get("/api/tags/1", params={"language": "en"}).json()
        ids = {b["id"] for b in data["books"]}
        assert ids == {3, 5}

    def test_tag_detail_filter_options_present(self, reader_client):
        data = reader_client.get("/api/tags/1").json()
        fo = data["filterOptions"]
        assert "authors" in fo
        assert "series" in fo
        assert "languages" in fo

    def test_tag_not_found(self, reader_client):
        resp = reader_client.get("/api/tags/999")
        assert resp.status_code == 404
