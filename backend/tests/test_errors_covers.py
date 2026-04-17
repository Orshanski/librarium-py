"""Gap-coverage for covers router error paths (401/403/404)."""
import io

from tests._helpers import assert_error


def test_upload_cover_reader_is_403(reader_client):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100  # fake PNG header
    resp = reader_client.post(
        "/api/books/1/cover",
        files={"file": ("cover.png", io.BytesIO(png), "image/png")},
    )
    assert_error(resp, 403)


def test_upload_cover_unauthenticated_is_401(anon_client):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    resp = anon_client.post(
        "/api/books/1/cover",
        files={"file": ("cover.png", io.BytesIO(png), "image/png")},
    )
    assert resp.status_code in (401, 403)


def test_download_cover_nonexistent_book_is_404(admin_client):
    resp = admin_client.post("/api/books/999999/cover/download",
                             json={"url": "http://example.com/img.jpg"})
    assert_error(resp, 404)
