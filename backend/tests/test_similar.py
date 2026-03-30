"""Tests for similar books: provider (find_litres_id, fetch_similar), DAL (exclude_owned), endpoint."""

import pytest
from unittest.mock import patch


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
                       author="Some Author", cover_url="/pub/c/cover/1.jpg", url="/book/x/"):
    return {
        "title": title,
        "art_type": art_type,
        "rating": {"rated_avg": rated_avg, "rated_total_count": rated_total_count},
        "persons": [{"full_name": author, "role": "author"}],
        "cover_url": cover_url,
        "url": url,
    }


# ── Block 1: TestLitresProviderFindId ──

class TestLitresProviderFindId:
    @patch("app.providers.litres._session.get")
    def test_exact_match(self, mock_get):
        mock_get.return_value = _search_response([{"id": 42, "title": "Minimal Test Book"}])
        from app.providers.litres import find_litres_id
        assert find_litres_id("Minimal Test Book Test Author", "Minimal Test Book") == 42

    @patch("app.providers.litres._session.get")
    def test_partial_match(self, mock_get):
        mock_get.return_value = _search_response([{"id": 99, "title": "Minimal Test Book. Extended Edition"}])
        from app.providers.litres import find_litres_id
        assert find_litres_id("Minimal Test Book", "Minimal Test Book") == 99

    @patch("app.providers.litres._session.get")
    def test_empty_results(self, mock_get):
        mock_get.return_value = _search_response([])
        from app.providers.litres import find_litres_id
        assert find_litres_id("Nonexistent", "Nonexistent") is None

    @patch("app.providers.litres._session.get")
    def test_no_title_match(self, mock_get):
        mock_get.return_value = _search_response([{"id": 1, "title": "Completely Different"}])
        from app.providers.litres import find_litres_id
        assert find_litres_id("My Book", "My Book") is None

    @patch("app.providers.litres._session.get")
    def test_non_200_raises(self, mock_get):
        mock_get.return_value = FakeResponse(500)
        from app.providers.litres import find_litres_id
        with pytest.raises(ConnectionError):
            find_litres_id("Test", "Test")


# ── Block 2: TestLitresProviderFetchSimilar ──

class TestLitresProviderFetchSimilar:
    @patch("app.providers.litres._session.get")
    def test_happy_path_filters(self, mock_get):
        items = [
            _make_similar_item(title="Good Book", art_type=0, rated_avg=4.8, rated_total_count=100),
            _make_similar_item(title="Audio Book", art_type=1, rated_avg=5.0, rated_total_count=200),
            _make_similar_item(title="Low Rated", art_type=0, rated_avg=3.0, rated_total_count=3),
        ]
        mock_get.return_value = _similar_response(items)
        from app.providers.litres import fetch_similar
        result = fetch_similar(123)
        assert len(result) == 1
        assert result[0]["title"] == "Good Book"

    @patch("app.providers.litres._session.get")
    def test_audio_filtered(self, mock_get):
        mock_get.return_value = _similar_response([
            _make_similar_item(art_type=1, rated_total_count=50),
        ])
        from app.providers.litres import fetch_similar
        assert fetch_similar(1) == []

    @patch("app.providers.litres._session.get")
    def test_low_rating_count_filtered(self, mock_get):
        mock_get.return_value = _similar_response([
            _make_similar_item(rated_total_count=2),
        ])
        from app.providers.litres import fetch_similar
        assert fetch_similar(1) == []

    @patch("app.providers.litres._session.get")
    def test_sorted_by_rating_desc(self, mock_get):
        mock_get.return_value = _similar_response([
            _make_similar_item(title="B", rated_avg=3.5, rated_total_count=10),
            _make_similar_item(title="A", rated_avg=4.9, rated_total_count=10),
        ])
        from app.providers.litres import fetch_similar
        result = fetch_similar(1)
        assert result[0]["title"] == "A"
        assert result[1]["title"] == "B"

    @patch("app.providers.litres._session.get")
    def test_normalization(self, mock_get):
        mock_get.return_value = _similar_response([
            _make_similar_item(title="Test", author="Author One", cover_url="/pub/c/cover/55.jpg", url="/book/test-55/"),
        ])
        from app.providers.litres import fetch_similar
        result = fetch_similar(1)
        assert result[0]["coverUrl"] == "/api/metadata/cover-proxy?url=https://cv5.litres.ru/pub/c/cover/55.jpg"
        assert result[0]["litresUrl"] == "https://www.litres.ru/book/test-55/"
        assert result[0]["authors"] == "Author One"

    @patch("app.providers.litres._session.get")
    def test_non_200_raises(self, mock_get):
        mock_get.return_value = FakeResponse(503)
        from app.providers.litres import fetch_similar
        with pytest.raises(ConnectionError):
            fetch_similar(1)


# ── Block 3: TestExcludeOwned ──

class TestExcludeOwned:
    def test_owned_book_filtered(self):
        from app.dal.similar import exclude_owned
        candidates = [
            {"title": "Minimal Test Book", "authors": "Test Author", "rating": 5.0},
            {"title": "Unknown Book", "authors": "Nobody", "rating": 4.0},
        ]
        result = exclude_owned(candidates)
        assert len(result) == 1
        assert result[0]["title"] == "Unknown Book"

    def test_unknown_book_passes(self):
        from app.dal.similar import exclude_owned
        candidates = [{"title": "Totally New", "authors": "Fresh Author", "rating": 4.0}]
        result = exclude_owned(candidates)
        assert len(result) == 1

    def test_same_title_different_author_passes(self):
        from app.dal.similar import exclude_owned
        candidates = [{"title": "Minimal Test Book", "authors": "Other Author", "rating": 4.0}]
        result = exclude_owned(candidates)
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
        titles = [b["title"] for b in data["books"]]
        assert "New Recommendation" in titles
        assert "Minimal Test Book" not in titles  # excluded by exclude_owned

    @patch("app.routers.similar.find_litres_id")
    def test_service_unavailable(self, mock_find, reader_client):
        mock_find.side_effect = ConnectionError("Litres down")
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
        resp = reader_client.get("/api/books/999/similar")
        assert resp.status_code == 404

    def test_unauthenticated(self, client):
        resp = client.get("/api/books/1/similar")
        assert resp.status_code == 401
