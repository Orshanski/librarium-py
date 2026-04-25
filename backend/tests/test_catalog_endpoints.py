"""Authors, series, and tags detail endpoints."""
from tests._helpers import assert_error


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

    def test_series_detail_books_have_series_object(self, reader_client):
        data = reader_client.get("/api/series/1").json()
        books = data["books"]
        assert len(books) == 2
        for b in books:
            assert b["series"]["name"] == "Test Series"
            assert b["series"]["id"] == 1
            assert b["series_number"] is not None


class TestTags:
    def test_all_tags(self, reader_client):
        data = reader_client.get("/api/filter-options/tags").json()
        assert len(data["tags"]) == 2

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

    def test_tag_detail_filter_author_plus_language(self, reader_client):
        """Cross-dimension: authorIds × language narrows to the intersection."""
        data = reader_client.get(
            "/api/tags/1", params={"authorIds": "1", "language": "en"}
        ).json()
        ids = {b["id"] for b in data["books"]}
        # author=1 → {1, 3}; language=en → {3, 5}; ∩ = {3}
        assert ids == {3}

    def test_tag_detail_filter_author_plus_series(self, reader_client):
        """Cross-dimension: authorIds × seriesIds."""
        data = reader_client.get(
            "/api/tags/1", params={"authorIds": "1", "seriesIds": "1"}
        ).json()
        ids = {b["id"] for b in data["books"]}
        # author=1 → {1, 3}; series=1 → {1, 3}; ∩ = {1, 3}
        assert ids == {1, 3}

    def test_tag_detail_filter_all_three(self, reader_client):
        """Cross-dimension: authorIds × seriesIds × language."""
        data = reader_client.get(
            "/api/tags/1",
            params={"authorIds": "1", "seriesIds": "1", "language": "en"},
        ).json()
        ids = {b["id"] for b in data["books"]}
        # {1,3} ∩ {1,3} ∩ {3,5} = {3}
        assert ids == {3}

    def test_tag_not_found(self, reader_client):
        assert_error(reader_client.get("/api/tags/999"), 404)
