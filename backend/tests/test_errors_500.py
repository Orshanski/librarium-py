"""Global unhandled exception handler (main.py:47-52)."""
from unittest.mock import patch

from starlette.testclient import TestClient

from app.main import app
from tests._helpers import assert_error


def test_unhandled_exception_returns_500():
    """Patch a DAL function to raise unexpectedly; the global handler must 500.

    Expected-red until E1: handler returns {"error": "Internal server error"},
    the target contract is {"detail": ...}.
    """
    no_raise = TestClient(app, raise_server_exceptions=False)
    no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})

    with patch("app.routers.auth.users_dal.get_user_by_username",
               side_effect=RuntimeError("boom")):
        resp = no_raise.post("/api/auth/login",
                             json={"username": "admin", "password": "admin123"})

    assert_error(resp, 500, message_matches="internal server error")
