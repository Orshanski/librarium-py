"""Global unhandled exception handler (main.py:47-52)."""
from unittest.mock import patch

from starlette.testclient import TestClient

from app.main import app


def test_unhandled_exception_returns_500():
    """Patch a DAL function to raise unexpectedly; the global handler must 500.

    Expected-red: handler returns {"error": "Internal server error"}, not {"detail": ...}.
    """
    no_raise = TestClient(app, raise_server_exceptions=False)
    no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})

    with patch("app.routers.auth.users_dal.get_user_by_username",
               side_effect=RuntimeError("boom")):
        resp = no_raise.post("/api/auth/login",
                             json={"username": "admin", "password": "admin123"})

    assert resp.status_code == 500, f"Expected 500, got {resp.status_code}. Body: {resp.text}"
    body = resp.json()
    assert "error" in body, f"Expected 'error' key in response, got {list(body.keys())}"
    assert "internal server error" in body["error"].lower(), f"Expected 'internal server error' in {body['error']}"
