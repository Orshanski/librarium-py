import logging
from datetime import datetime, timedelta, timezone

import jwt as pyjwt

from app.config import SECRET_KEY, JWT_ALGORITHM, COOKIE_NAME
from tests._helpers import assert_error, assert_ok


def test_login_admin(client):
    resp = client.post("/api/auth/login",
                       json={"username": "admin", "password": "admin123"})
    data = assert_ok(resp)
    assert data["user"]["role"] == "admin"
    assert "librarium_token" in resp.cookies


def test_login_reader(client):
    resp = client.post("/api/auth/login",
                       json={"username": "reader", "password": "reader123"})
    assert assert_ok(resp)["user"]["role"] == "reader"


def test_login_wrong_password(client):
    resp = client.post("/api/auth/login",
                       json={"username": "admin", "password": "wrong"})
    assert_error(resp, 401, message_matches="invalid credentials")


def test_login_nonexistent_user(client):
    resp = client.post("/api/auth/login",
                       json={"username": "nobody", "password": "test"})
    assert_error(resp, 401, message_matches="invalid credentials")


def test_me_authenticated(admin_client):
    resp = admin_client.get("/api/auth/me")
    assert assert_ok(resp)["username"] == "admin"


def test_me_unauthenticated(anon_client):
    resp = anon_client.get("/api/auth/me")
    assert_error(resp, 401)


def test_logout(admin_client):
    assert_ok(admin_client.post("/api/auth/logout"))
    assert_error(admin_client.get("/api/auth/me"), 401)


def test_reader_cannot_access_admin(reader_client):
    assert_error(reader_client.get("/api/admin/users"), 403)


# --- Edge cases (JWT) ---

def test_expired_token(anon_client):
    payload = {
        "userId": 1, "role": "admin",
        "exp": datetime(2020, 1, 1, tzinfo=timezone.utc),
    }
    token = pyjwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)
    anon_client.cookies.set(COOKIE_NAME, token)
    assert_error(anon_client.get("/api/auth/me"), 401, message_matches="expired")


def test_garbage_cookie(anon_client):
    anon_client.cookies.set(COOKIE_NAME, "not-a-valid-jwt-token")
    assert_error(anon_client.get("/api/auth/me"), 401)


def test_tampered_token(anon_client):
    token = pyjwt.encode(
        {"userId": 1, "role": "admin",
         "exp": datetime(2030, 1, 1, tzinfo=timezone.utc)},
        "wrong-secret-key-that-is-32-chars-long!!", algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)
    assert_error(anon_client.get("/api/auth/me"), 401)


# --- Token refresh ---

def test_fresh_token_not_refreshed(anon_client):
    """Token issued just now should NOT be refreshed."""
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"userId": 1, "role": "admin", "iat": now, "exp": now + timedelta(days=7)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)
    resp = anon_client.get("/api/auth/me")
    assert_ok(resp)
    assert COOKIE_NAME not in resp.cookies


def test_old_token_refreshed(anon_client):
    """Token older than JWT_REFRESH_AFTER_HOURS should get a new cookie."""
    now = datetime.now(timezone.utc)
    old_iat = now - timedelta(hours=85)  # > 84h threshold
    token = pyjwt.encode(
        {"userId": 1, "role": "admin", "iat": old_iat, "exp": now + timedelta(days=1)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)
    resp = anon_client.get("/api/auth/me")
    assert_ok(resp)
    assert COOKIE_NAME in resp.cookies
    new_token = resp.cookies[COOKIE_NAME]
    new_payload = pyjwt.decode(new_token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    assert new_payload["iat"] > old_iat.timestamp()
    assert new_payload["exp"] > (datetime.now(timezone.utc) + timedelta(days=6)).timestamp()


def test_old_token_not_refreshed_on_error(anon_client):
    """Token needing refresh should NOT get refreshed if endpoint returns error."""
    now = datetime.now(timezone.utc)
    old_iat = now - timedelta(hours=85)
    token = pyjwt.encode(
        {"userId": 2, "role": "reader", "iat": old_iat, "exp": now + timedelta(days=1)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)
    # Access admin-only endpoint as reader → 403
    resp = anon_client.get("/api/admin/users")
    assert_error(resp, 403)
    assert COOKIE_NAME not in resp.cookies


def test_token_without_iat_not_refreshed(anon_client):
    """Legacy token without iat should NOT be refreshed (backward compat)."""
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"userId": 1, "role": "admin", "exp": now + timedelta(days=7)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)
    resp = anon_client.get("/api/auth/me")
    assert_ok(resp)
    assert COOKIE_NAME not in resp.cookies


def test_malformed_jwt_missing_user_id(anon_client, caplog):
    """JWT with valid signature but missing `userId`: client sees 401 "Invalid token";
    ops sees specific reason in librarium.auth WARNING log."""
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"role": "admin", "iat": now, "exp": now + timedelta(hours=1)},
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)
    with caplog.at_level(logging.WARNING, logger="librarium.auth"):
        resp = anon_client.get("/api/auth/me")
    assert_error(resp, 401, message_matches="invalid token")
    assert "userId missing" in caplog.text


def test_malformed_jwt_wrong_user_id_type(anon_client, caplog):
    """JWT with `userId` as string: client sees 401 "Invalid token";
    ops sees "userId not int" in librarium.auth WARNING log."""
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"userId": "not-int", "role": "admin", "iat": now, "exp": now + timedelta(hours=1)},
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)
    with caplog.at_level(logging.WARNING, logger="librarium.auth"):
        resp = anon_client.get("/api/auth/me")
    assert_error(resp, 401, message_matches="invalid token")
    assert "userId not int" in caplog.text
