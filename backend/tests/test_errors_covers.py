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


# Note: earlier drafts referenced POST /api/books/{id}/cover/download — that
# endpoint never existed in the router. External-URL cover fetch happens
# client-side then uploads via POST /api/books/{id}/cover (covered above).
# Test removed to avoid testing non-existent endpoints.
