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
        data = reader_client.get("/api/filter-options/tags").json()
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
        data = reader_client.get("/api/filter-options/languages").json()
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
        data = reader_client.get("/api/filter-options/authors").json()
        assert len(data["authors"]) == 3

    def test_filter_by_tag(self, reader_client):
        data = reader_client.get("/api/authors", params={"tagIds": "1"}).json()
        ids = {a["id"] for a in data["authors"]}
        assert ids == {1, 2}

    def test_filter_by_language(self, reader_client):
        data = reader_client.get("/api/authors", params={"language": "ru"}).json()
        ids = {a["id"] for a in data["authors"]}
        assert ids == {1, 3}


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
        data = reader_client.get("/api/filter-options/tags").json()
        assert len(data["tags"]) == 2

    def test_tags_directory_no_book_count(self, reader_client):
        data = reader_client.get("/api/filter-options/tags").json()
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

    def test_tag_not_found(self, reader_client):
        resp = reader_client.get("/api/tags/999")
        assert resp.status_code == 404


# ── Directory endpoint filtering ──

class TestDirectoryFiltering:
    def test_tags_filter_by_author(self, reader_client):
        data = reader_client.get("/api/filter-options/tags", params={"authorIds": "1"}).json()
        tag_ids = {t["id"] for t in data["tags"]}
        # Author 1 has books with tag 1 (Фэнтези), not tag 2
        assert 1 in tag_ids
        assert 2 not in tag_ids

    def test_tags_filter_by_language(self, reader_client):
        data = reader_client.get("/api/filter-options/tags", params={"language": "ru"}).json()
        tag_ids = {t["id"] for t in data["tags"]}
        # ru books: 1 (tag 1), 4 (tag 2)
        assert tag_ids == {1, 2}

    def test_tags_filter_by_series(self, reader_client):
        data = reader_client.get("/api/filter-options/tags", params={"seriesIds": "1"}).json()
        tag_ids = {t["id"] for t in data["tags"]}
        # Series 1 books: 1, 3 — both have tag 1
        assert 1 in tag_ids

    def test_languages_filter_by_author(self, reader_client):
        data = reader_client.get("/api/filter-options/languages", params={"authorIds": "1"}).json()
        langs = {l["name"] for l in data["languages"]}
        # Author 1 has books in ru (book 1) and en (book 3)
        assert langs == {"ru", "en"}

    def test_languages_filter_by_tag(self, reader_client):
        data = reader_client.get("/api/filter-options/languages", params={"tagIds": "2"}).json()
        langs = {l["name"] for l in data["languages"]}
        # Tag 2 (Классический детектив): books 2 (en), 4 (ru), 5 (en)
        assert langs == {"ru", "en"}

    def test_languages_filter_by_author_narrowing(self, reader_client):
        data = reader_client.get("/api/filter-options/languages", params={"authorIds": "3"}).json()
        langs = {l["name"] for l in data["languages"]}
        # Author 3 only has book 4 (ru)
        assert langs == {"ru"}

    def test_authors_filter_options_with_filters(self, reader_client):
        """Filter-options authors endpoint should work with filters."""
        data = reader_client.get("/api/filter-options/authors", params={"tagIds": "1"}).json()
        ids = {a["id"] for a in data["authors"]}
        assert ids == {1, 2}

    def test_series_filter_options_gone(self, reader_client):
        """GET /api/series should NOT return filterOptions."""
        data = reader_client.get("/api/series").json()
        assert "filterOptions" not in data

    def test_authors_filter_options_gone(self, reader_client):
        """GET /api/authors should NOT return filterOptions."""
        data = reader_client.get("/api/authors").json()
        assert "filterOptions" not in data

    def test_books_filter_options_gone(self, reader_client):
        """GET /api/books should NOT return filterOptions."""
        data = reader_client.get("/api/books").json()
        assert "filterOptions" not in data

    def test_tag_detail_filter_options_gone(self, reader_client):
        """GET /api/tags/{id} should NOT return filterOptions."""
        data = reader_client.get("/api/tags/1").json()
        assert "filterOptions" not in data

    def test_hidden_book_excluded_from_options(self, reader_client):
        """Author unique to a hidden book should not appear in options."""
        # Hide book 4 (author 3 "Test Autor", only book for this author)
        reader_client.put("/api/books/4/hidden", json={"isHidden": True})
        data = reader_client.get("/api/filter-options/authors").json()
        author_ids = {a["id"] for a in data["authors"]}
        # Author 3 should be excluded — their only book is hidden
        assert 3 not in author_ids
        # Cleanup
        reader_client.put("/api/books/4/hidden", json={"isHidden": False})
