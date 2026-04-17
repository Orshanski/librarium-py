"""CSRF middleware error paths (main.py)."""
from starlette.testclient import TestClient

from app.main import app
from tests._helpers import assert_error


def _client_without_csrf():
    """Client WITHOUT X-Requested-With — triggers the CSRF middleware."""
    return TestClient(app)


def test_post_without_csrf_header_is_403():
    client = _client_without_csrf()
    resp = client.post("/api/auth/login",
                       json={"username": "admin", "password": "admin123"})
    assert_error(resp, 403, message_matches="csrf")


def test_get_does_not_require_csrf():
    client = _client_without_csrf()
    resp = client.get("/api/health")
    assert resp.status_code == 200
