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


# --- Token-epoch revocation on role change ---

def test_role_change_invalidates_existing_token_for_target_user(client):
    """Admin меняет роль reader'у → выпущенный ранее JWT этого reader'а становится 401."""
    # Reader логинится — получает JWT с tep=0.
    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200
    reader_token = resp.cookies[COOKIE_NAME]

    # Reader пока валиден.
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200

    # Админ заходит в отдельной сессии и меняет reader'у роль.
    admin = _admin_test_client()
    reader_id = _user_id_by_username(admin, "reader")
    resp = admin.put(f"/api/admin/users/{reader_id}", json={"role": "admin"})
    assert resp.status_code == 200, resp.text

    # Старый reader-токен теперь не валиден — JWT.tep=0, а в DB и кэше уже 1.
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, reader_token)
    resp = client.get("/api/auth/me")
    assert_error(resp, 401, message_matches="invalid token")


def test_role_change_does_not_invalidate_other_users_tokens(client):
    """Бамп epoch затрагивает только целевого пользователя, не остальных."""
    # Reader логинится, получает свой токен.
    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200
    reader_token = resp.cookies[COOKIE_NAME]

    # Админ в отдельной сессии меняет роль СЕБЕ запрещено, поэтому не админу.
    # Заведём третьего пользователя через admin API и поменяем ему роль.
    admin = _admin_test_client()
    resp = admin.post("/api/admin/users", json={
        "username": "victim", "password": "victim123",
        "role": "reader", "displayName": "V", "email": None,
    })
    assert resp.status_code in (200, 201), resp.text
    victim_id = _user_id_by_username(admin, "victim")
    resp = admin.put(f"/api/admin/users/{victim_id}", json={"role": "admin"})
    assert resp.status_code == 200

    # Reader, чью роль НЕ трогали, продолжает работать своим старым токеном.
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, reader_token)
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200, resp.text


def test_non_role_field_update_does_not_invalidate_token(client):
    """PUT user без поля role не должен сбрасывать токен."""
    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200
    reader_token = resp.cookies[COOKIE_NAME]

    admin = _admin_test_client()
    reader_id = _user_id_by_username(admin, "reader")
    resp = admin.put(f"/api/admin/users/{reader_id}", json={"displayName": "Renamed"})
    assert resp.status_code == 200

    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, reader_token)
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200, resp.text


def test_no_op_role_assignment_does_not_invalidate_token(client):
    """PUT с role равной текущей — это сохранение формы без изменений, не должно сбрасывать токен."""
    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200
    reader_token = resp.cookies[COOKIE_NAME]

    admin = _admin_test_client()
    reader_id = _user_id_by_username(admin, "reader")
    # role="reader" — та же что у пользователя.
    resp = admin.put(f"/api/admin/users/{reader_id}", json={"role": "reader"})
    assert resp.status_code == 200

    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, reader_token)
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200, resp.text


def test_stale_cache_self_heals_via_refetch_on_mismatch(client):
    """Race-симуляция: cache оказался со старым OLD значением при DB=NEW.
    Свежий JWT (tep=NEW) не должен ловить 401 — get_current_user обязан
    refetch'нуть DB на mismatch и обновить cache."""
    from app.auth import _token_epoch_cache

    admin = _admin_test_client()
    reader_id = _user_id_by_username(admin, "reader")

    # Админ меняет роль reader'у admin → bump epoch до 1, commit прошёл.
    resp = admin.put(f"/api/admin/users/{reader_id}", json={"role": "admin"})
    assert resp.status_code == 200

    # Симулируем stale cache: реальная гонка дала бы cache[reader_id]=0 (OLD),
    # тогда как DB.token_epoch=1 (NEW). Кладём руками.
    with _token_epoch_cache_lock_for_test():
        _token_epoch_cache[reader_id] = 0

    # Reader логинится свежо → JWT.tep = DB.token_epoch = 1.
    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200

    # Запрос с fresh-токеном: cache=0, jwt=1 → mismatch → refetch DB=1 → match → 200.
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200, resp.text


def test_stale_old_epoch_cache_does_not_accept_revoked_token(client):
    """If a pre-commit race repopulates OLD epoch, old JWT must still be rejected."""
    from app.auth import _token_epoch_cache, bump_token_epoch
    from app.database import db_session

    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200
    old_reader_token = resp.cookies[COOKIE_NAME]

    admin = _admin_test_client()
    reader_id = _user_id_by_username(admin, "reader")

    session = db_session()
    db = next(session)
    bump_token_epoch(db, reader_id)

    # Simulate the race from auth.py comments: after bump but before commit, a
    # concurrent old-token request read pre-commit DB.token_epoch=0 and cached it.
    with _token_epoch_cache_lock_for_test():
        _token_epoch_cache[reader_id] = 0

    try:
        next(session)
    except StopIteration:
        pass

    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, old_reader_token)
    resp = client.get("/api/auth/me")
    assert_error(resp, 401, message_matches="invalid token")


def test_old_token_rejected_between_commit_and_cache_invalidation_hook(client):
    """A request after commit but before invalidation hook must not trust OLD cache."""
    from app.auth import _token_epoch_cache, bump_token_epoch
    from app.database import add_after_commit_hook, db_session

    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200
    old_reader_token = resp.cookies[COOKIE_NAME]

    admin = _admin_test_client()
    reader_id = _user_id_by_username(admin, "reader")
    with _token_epoch_cache_lock_for_test():
        _token_epoch_cache[reader_id] = 0

    observed_statuses: list[int] = []

    def probe_old_token_before_invalidation() -> None:
        client.cookies.clear()
        client.cookies.set(COOKIE_NAME, old_reader_token)
        observed_statuses.append(client.get("/api/auth/me").status_code)

    session = db_session()
    db = next(session)
    assert add_after_commit_hook(db, probe_old_token_before_invalidation)
    bump_token_epoch(db, reader_id)
    try:
        next(session)
    except StopIteration:
        pass

    assert observed_statuses == [401]


def _token_epoch_cache_lock_for_test():
    """Доступ к module-private locks в тестах — короткий контекст-менеджер."""
    from app.auth import _token_epoch_cache_lock
    return _token_epoch_cache_lock


def test_bump_then_rollback_does_not_lock_user_out(client):
    """Bump с последующим rollback в той же транзакции не должен порождать рассинхрон cache↔DB.

    Покрывает Major-1 (single-tx rollback). Concurrency-окно «после bump, до commit»
    — отдельный сценарий, покрывается test_stale_old_epoch_cache_does_not_accept_revoked_token."""
    from app.auth import bump_token_epoch
    from app.database import _get_db

    # Reader логинится.
    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200
    reader_token = resp.cookies[COOKIE_NAME]

    # Прогреваем кэш — вызываем endpoint, чтобы _ensure_init подгрузил все эпохи.
    client.get("/api/auth/me")

    # Имитируем админ-handler: bump, затем catastrophic rollback.
    admin = _admin_test_client()
    reader_id = _user_id_by_username(admin, "reader")
    db = _get_db()
    bump_token_epoch(db, reader_id)
    db.rollback()

    # Reader должен продолжать работать своим токеном (DB вернулась к старому epoch,
    # cache был invalidated и при следующем запросе перечитает актуальное).
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, reader_token)
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200, resp.text


def _admin_test_client():
    """Залогиненный админский TestClient — отдельный, чтоб не пересекался с тестовым `client`."""
    from starlette.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    c.headers.update({"X-Requested-With": "XMLHttpRequest"})
    resp = c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    return c


def _user_id_by_username(admin_client_, username: str) -> int:
    resp = admin_client_.get("/api/admin/users")
    assert resp.status_code == 200, resp.text
    users = resp.json()["users"]
    return next(u["id"] for u in users if u["username"] == username)
