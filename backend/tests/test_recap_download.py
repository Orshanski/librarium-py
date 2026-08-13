"""Выдача структуры рекапа читателю."""
from tests._helpers import assert_error
from tests.test_recap_upload import DOC


class TestRecapDownload:
    def test_returns_saved_document(self, reader_client):
        reader_client.put("/api/books/2/recap", json=DOC)
        resp = reader_client.get("/api/books/2/recap")
        assert resp.status_code == 200
        assert resp.json()["recap"]["sections"][0]["kind"] == "people"

    def test_cache_header_is_private(self, reader_client):
        reader_client.put("/api/books/2/recap", json=DOC)
        resp = reader_client.get("/api/books/2/recap")
        assert "private" in resp.headers.get("cache-control", "")

    def test_missing_recap(self, reader_client):
        assert_error(reader_client.get("/api/books/1/recap"), 404)

    def test_requires_login(self, anon_client):
        assert_error(anon_client.get("/api/books/2/recap"), 401)
