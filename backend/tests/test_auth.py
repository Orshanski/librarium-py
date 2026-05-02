import logging
from datetime import datetime, timedelta, timezone

import jwt as pyjwt

from app.config import SECRET_KEY, JWT_ALGORITHM, COOKIE_NAME
from tests._helpers import assert_error, assert_ok, connect_test_db


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


# --- Role invalidation (DB-backed) ---

def test_role_mismatch_with_db_demotes_user_to_db_role(anon_client):
    """JWT says admin, DB says reader → admin-only endpoint returns 403."""
    from app.dal import users as users_dal
    db = connect_test_db()
    users_dal.update_user(db, 2, {"role": "admin"})  # promote reader to admin via DAL
    db.commit(); db.close()

    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"userId": 2, "role": "admin", "iat": now, "exp": now + timedelta(days=7)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)

    db = connect_test_db()
    users_dal.update_user(db, 2, {"role": "reader"})  # demote in DB while JWT still says admin
    db.commit(); db.close()

    resp = anon_client.get("/api/admin/users")
    assert_error(resp, 403)


def test_role_mismatch_refreshes_cookie_on_success(anon_client):
    """JWT says admin, DB says reader, request to read-only endpoint → 200 + new cookie with role=reader."""
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"userId": 1, "role": "admin", "iat": now, "exp": now + timedelta(days=7)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)

    from app.dal import users as users_dal
    db = connect_test_db()
    users_dal.update_user(db, 1, {"role": "reader"})  # demote admin in DB
    db.commit(); db.close()

    resp = anon_client.get("/api/auth/me")
    assert_ok(resp)
    assert COOKIE_NAME in resp.cookies
    new_token = resp.cookies[COOKIE_NAME]
    new_payload = pyjwt.decode(new_token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    assert new_payload["role"] == "reader"


def test_role_mismatch_does_not_refresh_on_error(anon_client):
    """JWT says admin, DB says reader, admin-only endpoint → 403 + no refresh cookie (existing middleware contract)."""
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"userId": 1, "role": "admin", "iat": now, "exp": now + timedelta(days=7)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)

    from app.dal import users as users_dal
    db = connect_test_db()
    users_dal.update_user(db, 1, {"role": "reader"})
    db.commit(); db.close()

    resp = anon_client.get("/api/admin/users")
    assert_error(resp, 403)
    assert COOKIE_NAME not in resp.cookies


def test_deleted_user_returns_401(anon_client):
    """Valid JWT for a user removed from DB → 401."""
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"userId": 2, "role": "reader", "iat": now, "exp": now + timedelta(days=7)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)

    from app.dal import users as users_dal
    db = connect_test_db()
    users_dal.delete_user(db, 2)
    db.commit(); db.close()

    resp = anon_client.get("/api/auth/me")
    assert_error(resp, 401)


def test_logout_after_role_change_clears_cookie(anon_client):
    """Logout after admin demotes the user must clear the cookie (no middleware re-issue).

    Без Task 3 (logout-fix) этот тест ловил бы баг: get_current_user видит mismatch,
    взводит request.state._refresh_token, middleware на 200 вызывает set_cookie,
    delete_cookie из logout нивелируется. Task 3 убирает get_current_user из logout —
    рефреш-флаг не взводится, delete_cookie выигрывает.
    """
    from app.dal import users as users_dal
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {"userId": 1, "role": "admin", "iat": now, "exp": now + timedelta(days=7)},
        SECRET_KEY, algorithm=JWT_ALGORITHM,
    )
    anon_client.cookies.set(COOKIE_NAME, token)

    db = connect_test_db()
    users_dal.update_user(db, 1, {"role": "reader"})
    db.commit(); db.close()

    resp = anon_client.post("/api/auth/logout")
    assert resp.status_code == 200
    # ВАЖНО: get_list, не get — иначе delete + (теоретический) refresh склеятся через запятую,
    # и assertions ниже пройдут даже в багованном сценарии.
    set_cookie_headers = (
        resp.headers.get_list("set-cookie")
        if hasattr(resp.headers, "get_list")
        else [resp.headers.get("set-cookie", "")]
    )
    # Должен быть ровно один Set-Cookie — от delete_cookie.
    # Если бы Task 3 не был сделан, mismatch взвёл бы _refresh_token и middleware
    # добавил бы второй Set-Cookie со свежим токеном — тест поймал бы это.
    assert len(set_cookie_headers) == 1, (
        f"expected 1 Set-Cookie, got {len(set_cookie_headers)}: {set_cookie_headers}"
    )
    the_cookie = set_cookie_headers[0]
    assert the_cookie.startswith('librarium_token=""') or the_cookie.startswith("librarium_token=;"), (
        f"expected empty cookie value, got: {the_cookie}"
    )
    assert "Max-Age=0" in the_cookie or "expires=" in the_cookie.lower()
