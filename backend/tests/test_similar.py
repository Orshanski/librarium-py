"""Tests for similar books: provider (find_litres_id, fetch_similar), DAL (exclude_owned), endpoint.

Test architecture: 3-layer separation.
- Provider unit tests patch _session.get (HTTP layer) to verify filtering, sorting, normalization.
- Endpoint tests patch provider boundary (find_litres_id, fetch_similar) to verify routing,
  error handling, and DAL integration. exclude_owned runs against real seed DB.
- No full-stack HTTP-mock integration test by design: Litres API is unofficial and undocumented,
  so mocking its exact HTTP responses at endpoint level adds fragility without real confidence.
  If Litres changes their response format, unit mocks won't catch it either — only manual testing will.
"""

import pytest
from unittest.mock import patch
from app.providers.litres import find_litres_id, fetch_similar
from app.dal.similar import exclude_owned

from tests._helpers import assert_error


# ── Helper ──

class FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


def _search_response(items):
    """Build a Litres search API response with instance wrapper."""
    return FakeResponse(200, {
        "payload": {"data": [{"instance": item} for item in items]}
    })


def _similar_response(items):
    """Build a Litres similar API response (flat, no instance wrapper)."""
    return FakeResponse(200, {"payload": {"data": items}})


def _make_similar_item(title="Some Book", art_type=0, rated_avg=4.5, rated_total_count=50,
                       authors=None, cover_url="/pub/c/cover/1.jpg", url="/book/x/"):
    persons = authors if authors is not None else [{"full_name": "Some Author", "role": "author"}]
    return {
        "title": title,
        "art_type": art_type,
        "rating": {"rated_avg": rated_avg, "rated_total_count": rated_total_count},
        "persons": persons,
        "cover_url": cover_url,
        "url": url,
    }


# ── Block 1: TestLitresProviderFindId ──

class TestLitresProviderFindId:
    @patch("app.providers.litres._session.get")
    def test_exact_match(self, mock_get):
        mock_get.return_value = _search_response([{"id": 42, "title": "Minimal Test Book"}])
        assert find_litres_id("Minimal Test Book Test Author", "Minimal Test Book") == 42

    @patch("app.providers.litres._session.get")
    def test_partial_match_litres_longer(self, mock_get):
        mock_get.return_value = _search_response([{"id": 99, "title": "Minimal Test Book. Extended Edition"}])
        assert find_litres_id("Minimal Test Book", "Minimal Test Book") == 99

    @patch("app.providers.litres._session.get")
    def test_partial_match_our_title_longer(self, mock_get):
        mock_get.return_value = _search_response([{"id": 77, "title": "Minimal Test Book"}])
        assert find_litres_id("Minimal Test Book Extended", "Minimal Test Book Extended") == 77

    @patch("app.providers.litres._session.get")
    def test_empty_results(self, mock_get):
        mock_get.return_value = _search_response([])
        assert find_litres_id("Nonexistent", "Nonexistent") is None

    @patch("app.providers.litres._session.get")
    def test_no_title_match(self, mock_get):
        mock_get.return_value = _search_response([{"id": 1, "title": "Completely Different"}])
        assert find_litres_id("My Book", "My Book") is None

    @patch("app.providers.litres._session.get")
    def test_non_200_raises(self, mock_get):
        mock_get.return_value = FakeResponse(500)
        with pytest.raises(ConnectionError):
            find_litres_id("Test", "Test")


# ── Block 2: TestLitresProviderFetchSimilar ──

class TestLitresProviderFetchSimilar:
    @patch("app.providers.litres._session.get")
    def test_mixed_payload_filters(self, mock_get):
        items = [
            _make_similar_item(title="Good Ebook", art_type=0, rated_avg=4.8, rated_total_count=100),
            _make_similar_item(title="Audio Book", art_type=1, rated_avg=5.0, rated_total_count=200),
            _make_similar_item(title="Few Reviews", art_type=0, rated_avg=3.0, rated_total_count=3),
        ]
        mock_get.return_value = _similar_response(items)
        result = fetch_similar(123)
        assert len(result) == 1
        assert result[0]["title"] == "Good Ebook"

    @patch("app.providers.litres._session.get")
    def test_audio_filtered(self, mock_get):
        mock_get.return_value = _similar_response([
            _make_similar_item(art_type=1, rated_total_count=50),
        ])
        assert fetch_similar(1) == []

    @patch("app.providers.litres._session.get")
    def test_pdf_passes(self, mock_get):
        mock_get.return_value = _similar_response([
            _make_similar_item(title="PDF Book", art_type=4, rated_total_count=20),
        ])
        result = fetch_similar(1)
        assert len(result) == 1
        assert result[0]["title"] == "PDF Book"

    @patch("app.providers.litres._session.get")
    def test_low_rating_count_filtered(self, mock_get):
        mock_get.return_value = _similar_response([
            _make_similar_item(rated_total_count=2),
        ])
        assert fetch_similar(1) == []

    @patch("app.providers.litres._session.get")
    def test_sorted_by_rating_desc(self, mock_get):
        mock_get.return_value = _similar_response([
            _make_similar_item(title="B", rated_avg=3.5, rated_total_count=10),
            _make_similar_item(title="A", rated_avg=4.9, rated_total_count=10),
        ])
        result = fetch_similar(1)
        assert result[0]["title"] == "A"
        assert result[1]["title"] == "B"

    @patch("app.providers.litres._session.get")
    def test_multi_author_normalization(self, mock_get):
        item = _make_similar_item(
            title="Test",
            authors=[
                {"full_name": "Author One", "role": "author"},
                {"full_name": "Author Two", "role": "author"},
                {"full_name": "Narrator", "role": "reader"},
            ],
            cover_url="/pub/c/cover/55.jpg",
            url="/book/test-55/",
        )
        mock_get.return_value = _similar_response([item])
        result = fetch_similar(1)
        assert result[0]["authors"] == "Author One, Author Two"
        assert result[0]["coverUrl"] == "/api/metadata/cover-proxy?url=https://cv5.litres.ru/pub/c/cover/55.jpg"
        assert result[0]["litresUrl"] == "https://www.litres.ru/book/test-55/"

    @patch("app.providers.litres._session.get")
    def test_non_200_raises(self, mock_get):
        mock_get.return_value = FakeResponse(503)
        with pytest.raises(ConnectionError):
            fetch_similar(1)


# ── Block 3: TestExcludeOwned ──

class TestExcludeOwned:
    def test_owned_book_filtered(self, db):
        candidates = [
            {"title": "Minimal Test Book", "authors": "Test Author", "rating": 5.0},
            {"title": "Unknown Book", "authors": "Nobody", "rating": 4.0},
        ]
        result = exclude_owned(db, candidates)
        assert len(result) == 1
        assert result[0]["title"] == "Unknown Book"

    def test_unknown_book_passes(self, db):
        candidates = [{"title": "Totally New", "authors": "Fresh Author", "rating": 4.0}]
        result = exclude_owned(db, candidates)
        assert len(result) == 1

    def test_same_title_different_author_passes(self, db):
        candidates = [{"title": "Minimal Test Book", "authors": "Other Author", "rating": 4.0}]
        result = exclude_owned(db, candidates)
        assert len(result) == 1
        assert result[0]["authors"] == "Other Author"


# ── Block 4: TestSimilarEndpoint ──

class TestSimilarEndpoint:
    @patch("app.routers.similar.fetch_similar")
    @patch("app.routers.similar.find_litres_id")
    def test_happy_path(self, mock_find, mock_fetch, reader_client):
        mock_find.return_value = 123
        mock_fetch.return_value = [
            {"title": "New Recommendation", "authors": "New Author", "coverUrl": "", "litresUrl": "", "rating": 4.5, "ratingCount": 50},
            {"title": "Minimal Test Book", "authors": "Test Author", "coverUrl": "", "litresUrl": "", "rating": 5.0, "ratingCount": 100},
        ]
        resp = reader_client.get("/api/books/1/similar")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source"] == "litres"
        assert data["error"] is None
        assert len(data["books"]) == 1
        book = data["books"][0]
        assert set(book.keys()) == {"title", "authors", "coverUrl", "litresUrl", "rating", "ratingCount"}
        assert book["title"] == "New Recommendation"

    @patch("app.routers.similar.find_litres_id")
    def test_find_service_unavailable(self, mock_find, reader_client):
        mock_find.side_effect = ConnectionError("Litres down")
        resp = reader_client.get("/api/books/1/similar")
        assert resp.status_code == 200
        data = resp.json()
        assert data["books"] == []
        assert data["error"] == "service_unavailable"

    @patch("app.routers.similar.fetch_similar")
    @patch("app.routers.similar.find_litres_id")
    def test_fetch_service_unavailable(self, mock_find, mock_fetch, reader_client):
        mock_find.return_value = 123
        mock_fetch.side_effect = ConnectionError("Litres similar down")
        resp = reader_client.get("/api/books/1/similar")
        assert resp.status_code == 200
        data = resp.json()
        assert data["books"] == []
        assert data["error"] == "service_unavailable"

    @patch("app.routers.similar.find_litres_id")
    def test_not_found_on_litres(self, mock_find, reader_client):
        mock_find.return_value = None
        resp = reader_client.get("/api/books/1/similar")
        assert resp.status_code == 200
        data = resp.json()
        assert data["books"] == []
        assert data["error"] is None

    def test_nonexistent_book(self, reader_client):
        assert_error(reader_client.get("/api/books/999/similar"), 404)

    def test_unauthenticated(self, anon_client):
        assert_error(anon_client.get("/api/books/1/similar"), 401)
