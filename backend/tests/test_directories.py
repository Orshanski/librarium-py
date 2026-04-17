"""Filter-option directories: tags, languages, publishers."""


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
