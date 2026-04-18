"""Integration tests для exception_handler регистрации.

Создаёт отдельную FastAPI app с register_error_handlers + test endpoint'ами,
которые raise каждый custom exception. Проверяет status + detail response.
"""
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.error_handlers import register_error_handlers
from app.exceptions import (
    AuthError, BadInputError, ConflictError, ForbiddenError,
    NotFoundError, RateLimitError, UpstreamError,
)


@pytest.fixture
def app_with_handlers():
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/raise-bad-input")
    def _bad_input():
        raise BadInputError("bad input message")

    @app.get("/raise-not-found")
    def _not_found():
        raise NotFoundError("not found message")

    @app.get("/raise-conflict")
    def _conflict():
        raise ConflictError("conflict message")

    @app.get("/raise-forbidden")
    def _forbidden():
        raise ForbiddenError("forbidden message")

    @app.get("/raise-auth")
    def _auth():
        raise AuthError("auth message")

    @app.get("/raise-rate-limit")
    def _rate_limit():
        raise RateLimitError("rate limit message")

    @app.get("/raise-upstream")
    def _upstream():
        raise UpstreamError("upstream message")

    # Regression-proof: custom handler НЕ ловит raw builtin.
    @app.get("/raise-raw-value-error")
    def _raw_value():
        raise ValueError("raw value error")

    @app.get("/raise-raw-lookup-error")
    def _raw_lookup():
        raise LookupError("raw lookup")

    @app.get("/raise-raw-key-error")
    def _raw_key():
        raise KeyError("raw key")

    @app.get("/raise-raw-file-exists")
    def _raw_file_exists():
        raise FileExistsError("raw file exists")

    @app.get("/raise-raw-permission")
    def _raw_permission():
        raise PermissionError("raw permission")

    # Dependency-raise тест.
    def _raises_auth():
        raise AuthError("dep auth failure")

    @app.get("/dep-raises")
    def _via_dep(_=Depends(_raises_auth)):
        return {"ok": True}

    return app


@pytest.fixture
def client(app_with_handlers):
    return TestClient(app_with_handlers, raise_server_exceptions=False)


class TestCustomHandlers:
    @pytest.mark.parametrize("path,status,detail", [
        ("/raise-bad-input", 400, "bad input message"),
        ("/raise-not-found", 404, "not found message"),
        ("/raise-conflict", 409, "conflict message"),
        ("/raise-forbidden", 403, "forbidden message"),
        ("/raise-auth", 401, "auth message"),
        ("/raise-rate-limit", 429, "rate limit message"),
        ("/raise-upstream", 502, "upstream message"),
    ])
    def test_custom_exception_maps(self, client, path, status, detail):
        resp = client.get(path)
        assert resp.status_code == status
        assert resp.json() == {"detail": detail}


class TestHandlerIsolation:
    """Regression-proof: raw builtin exceptions НЕ превращаются в 400/404/409/403.

    Они улетают в generic Exception handler → 500. Это защита от implicit
    contract — случайный int("abc") ValueError не станет user-facing 400.
    """

    def test_raw_value_error_is_500(self, client):
        resp = client.get("/raise-raw-value-error")
        assert resp.status_code == 500

    def test_raw_lookup_error_is_500(self, client):
        resp = client.get("/raise-raw-lookup-error")
        assert resp.status_code == 500

    def test_raw_key_error_is_500(self, client):
        """KeyError — подкласс LookupError, но НЕ NotFoundError. → 500."""
        resp = client.get("/raise-raw-key-error")
        assert resp.status_code == 500

    def test_raw_file_exists_is_500(self, client):
        resp = client.get("/raise-raw-file-exists")
        assert resp.status_code == 500

    def test_raw_permission_is_500(self, client):
        resp = client.get("/raise-raw-permission")
        assert resp.status_code == 500


class TestDependencyExceptions:
    def test_auth_error_from_dependency_is_401(self, client):
        """Exception из FastAPI Depends ловится handler'ом так же, как из endpoint'а."""
        resp = client.get("/dep-raises")
        assert resp.status_code == 401
        assert resp.json() == {"detail": "dep auth failure"}
