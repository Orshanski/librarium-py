"""Similar books endpoint: auth + business-state contract."""
from tests._helpers import assert_error


def test_similar_unauthenticated_is_401(anon_client):
    assert_error(anon_client.get("/api/books/1/similar"), 401)


def test_similar_nonexistent_book_is_404(reader_client):
    """Nonexistent book returns 404 with error message."""
    resp = reader_client.get("/api/books/999999/similar")
    assert resp.status_code == 404
    body = resp.json()
    assert body["error"] == "Not found"
