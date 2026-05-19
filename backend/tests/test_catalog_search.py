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

    def test_search_returns_full_card_fields(self, reader_client):
        """GET /api/search returns books[] with seriesNumber, rating, isRead — full BookCardItem-like hit."""
        # Baseline seeds user_books(user_id=2/reader, book_id=1, rating=5, is_read=1)
        # for book "Minimal Test Book" (series_id=1, series_number=1).
        data = assert_ok(reader_client.get("/api/search", params={"q": "Minimal"}))
        assert len(data["books"]) > 0, f"no hits for query, payload={data}"
        book = next(b for b in data["books"] if b["id"] == 1)
        # Card-level fields must be present on the wire.
        assert "seriesNumber" in book
        assert "rating" in book
        assert "isRead" in book
        # Reader (user 2) has rating=5, is_read=1 for book 1; series_number=1.
        assert book["seriesNumber"] == 1
        assert book["rating"] == 5
        assert book["isRead"] == 1
