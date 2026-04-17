"""Similar books endpoint error paths."""
from tests._helpers import assert_error


def test_similar_unauthenticated_is_401(anon_client):
    assert_error(anon_client.get("/api/books/1/similar"), 401)


def test_similar_nonexistent_book_is_404(reader_client):
    """Nonexistent book: 404 with error detail.

    Expected-red until E1: endpoint returns {"error": ...}, target is {"detail": ...}.
    """
    assert_error(reader_client.get("/api/books/999999/similar"),
                 404, message_matches="not found")
