"""Cover fetch from external URL / dedupe / HTTP flow."""

from tests._helpers import assert_error


def test_download_cover_nonexistent_book_is_404(admin_client):
    """Cover download endpoint requires valid book_id."""
    resp = admin_client.post(
        "/api/books/999999/cover/download",
        json={"url": "http://example.com/img.jpg"},
    )
    assert_error(resp, 404)
