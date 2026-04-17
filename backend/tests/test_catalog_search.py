"""API-level tests for /api/search endpoint.

Wire-format contract for GET /api/search?q=...: returns {books, authors, series}.
Separated from test_search.py, which covers unit-level search_preprocess and
DAL-level fuzzy search behaviour.
"""
from tests._helpers import assert_ok


class TestSearch:
    def test_search_by_title(self, reader_client):
        data = assert_ok(reader_client.get("/api/search", params={"q": "Minimal"}))
        assert len(data["books"]) >= 1

    def test_search_by_author(self, reader_client):
        data = assert_ok(reader_client.get("/api/search", params={"q": "Cover"}))
        assert len(data["authors"]) >= 1

    def test_search_by_series(self, reader_client):
        data = assert_ok(reader_client.get("/api/search", params={"q": "Test Series"}))
        assert len(data["series"]) >= 1

    def test_search_partial_match(self, reader_client):
        data = assert_ok(reader_client.get("/api/search", params={"q": "Seri"}))
        assert len(data["series"]) >= 1

    def test_search_empty_query(self, reader_client):
        data = assert_ok(reader_client.get("/api/search", params={"q": ""}))
        assert data == {"books": [], "authors": [], "series": []}

    def test_search_no_results(self, reader_client):
        data = assert_ok(reader_client.get("/api/search", params={"q": "xyznonexistent"}))
        assert data["books"] == []
        assert data["authors"] == []
        assert data["series"] == []
