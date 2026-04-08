from datetime import datetime, timedelta, timezone

import jwt as pyjwt

from app.config import SECRET_KEY, JWT_ALGORITHM, COOKIE_NAME


def test_login_admin(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "admin"
    assert "librarium_token" in resp.cookies


def test_login_reader(client):
    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "reader"


def test_login_wrong_password(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_login_nonexistent_user(client):
    resp = client.post("/api/auth/login", json={"username": "nobody", "password": "test"})
    assert resp.status_code == 401


def test_login_requires_csrf_header():
    from starlette.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 403
    assert resp.json()["error"] == "Missing required CSRF header"


def test_me_authenticated(admin_client):
    resp = admin_client.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json()["username"] == "admin"


def test_me_unauthenticated(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_logout(admin_client):
    resp = admin_client.post("/api/auth/logout")
    assert resp.status_code == 200
    resp = admin_client.get("/api/auth/me")
    assert resp.status_code == 401


def test_reader_cannot_access_admin(reader_client):
    resp = reader_client.get("/api/admin/users")
    assert resp.status_code == 403


# ── Edge cases ──


def test_expired_token(client):
    """Expired JWT возвращает 401."""
    payload = {
        "userId": 1,
        "role": "admin",
        "exp": datetime(2020, 1, 1, tzinfo=timezone.utc),
    }
    token = pyjwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)
    client.cookies.set(COOKIE_NAME, token)

    resp = client.get("/api/auth/me")
    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower()


def test_garbage_cookie(client):
    """Мусорный cookie (не JWT) возвращает 401."""
    client.cookies.set(COOKIE_NAME, "not-a-valid-jwt-token")

    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_tampered_token(client):
    """JWT с подменённым payload (невалидная подпись) возвращает 401."""
    token = pyjwt.encode(
        {"userId": 1, "role": "admin", "exp": datetime(2030, 1, 1, tzinfo=timezone.utc)},
        "wrong-secret-key",
        algorithm=JWT_ALGORITHM,
    )
    client.cookies.set(COOKIE_NAME, token)

    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


# ── Token refresh ──


def test_fresh_token_not_refreshed(client):
    """Token issued just now should NOT be refreshed."""
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"userId": 1, "role": "admin", "iat": now, "exp": now + timedelta(days=7)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    client.cookies.set(COOKIE_NAME, token)
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    assert COOKIE_NAME not in resp.cookies


def test_old_token_refreshed(client):
    """Token older than JWT_REFRESH_AFTER_HOURS should get a new cookie."""
    now = datetime.now(timezone.utc)
    old_iat = now - timedelta(hours=85)  # > 84h threshold
    token = pyjwt.encode(
        {"userId": 1, "role": "admin", "iat": old_iat, "exp": now + timedelta(days=1)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    client.cookies.set(COOKIE_NAME, token)
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    assert COOKIE_NAME in resp.cookies
    # New token should have fresh iat
    new_token = resp.cookies[COOKIE_NAME]
    new_payload = pyjwt.decode(new_token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    assert new_payload["iat"] > old_iat.timestamp()
    # exp should be extended to a full TTL from now
    assert new_payload["exp"] > (datetime.now(timezone.utc) + timedelta(days=6)).timestamp()


def test_token_without_iat_not_refreshed(client):
    """Legacy token without iat should NOT be refreshed (backward compat)."""
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"userId": 1, "role": "admin", "exp": now + timedelta(days=7)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    client.cookies.set(COOKIE_NAME, token)
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    assert COOKIE_NAME not in resp.cookies
