"""Вход в каталог OPDS: документ аутентификации, выдача токена, Bearer, 401."""
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
import pytest

from app.config import COOKIE_NAME, JWT_ALGORITHM, JWT_EXPIRE_HOURS, SECRET_KEY
from tests._helpers.opds import AUTH_TYPE, FEED_TYPE, assert_valid_auth_document, bearer, opds_token
AUTH_LINK = '</opds/auth>; rel="http://opds-spec.org/auth/document"; type="application/opds-authentication+json"'


def _token_form(**overrides):
    form = {"grant_type": "password", "username": "reader", "password": "reader123"}
    form.update(overrides)
    return form


class TestAuthDocument:
    def test_available_without_login(self, anon_client):
        resp = anon_client.get("/opds/auth")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == AUTH_TYPE
        doc = resp.json()
        assert_valid_auth_document(doc)
        assert doc["id"] == "http://testserver/opds/auth"
        assert doc["title"]
        [flow] = doc["authentication"]
        assert flow["type"] == "http://opds-spec.org/auth/oauth/password"
        assert {"rel": "authenticate", "href": "/opds/token", "type": "application/json"} in flow["links"]
        assert flow["labels"]["login"] and flow["labels"]["password"]


class TestUnauthorized:
    @pytest.mark.parametrize("headers", [
        {},
        {"Authorization": "Bearer not-a-jwt"},
        {"Authorization": "Basic cmVhZGVyOnJlYWRlcjEyMw=="},
    ], ids=["no-header", "garbage-token", "basic-scheme"])
    def test_feed_without_valid_token_is_401_with_auth_document(self, anon_client, headers):
        resp = anon_client.get("/opds/", headers=headers)
        assert resp.status_code == 401
        assert resp.headers["content-type"] == AUTH_TYPE
        assert resp.headers["link"] == AUTH_LINK
        doc = resp.json()
        assert_valid_auth_document(doc)
        assert doc == anon_client.get("/opds/auth").json()

    def test_site_cookie_is_not_accepted(self, reader_client):
        resp = reader_client.get("/opds/")
        assert resp.status_code == 401
        assert resp.headers["content-type"] == AUTH_TYPE

    def test_expired_token_is_401(self, anon_client):
        token = pyjwt.encode(
            {"userId": 2, "role": "reader", "tep": 0,
             "exp": datetime(2020, 1, 1, tzinfo=timezone.utc)},
            SECRET_KEY, algorithm=JWT_ALGORITHM,
        )
        resp = anon_client.get("/opds/", headers=bearer(token))
        assert resp.status_code == 401
        assert resp.headers["content-type"] == AUTH_TYPE
        assert resp.headers["link"] == AUTH_LINK
        assert_valid_auth_document(resp.json())

    def test_revoked_token_is_401(self, anon_client, db):
        token = opds_token(anon_client)
        from app.auth import bump_token_epoch
        bump_token_epoch(db, 2)
        db.commit()
        resp = anon_client.get("/opds/", headers=bearer(token))
        assert resp.status_code == 401
        assert resp.headers["content-type"] == AUTH_TYPE


class TestTokenEndpoint:
    def test_issues_bearer_token(self, anon_client):
        resp = anon_client.post("/opds/token", data=_token_form())
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "bearer"
        assert body["expires_in"] == JWT_EXPIRE_HOURS * 3600
        assert resp.headers["cache-control"] == "no-store"
        assert resp.headers["pragma"] == "no-cache"
        assert "set-cookie" not in resp.headers
        assert anon_client.get("/opds/", headers=bearer(body["access_token"])).status_code == 200

    def test_extra_parameters_do_not_matter(self, anon_client):
        resp = anon_client.post("/opds/token", data=_token_form(client_id="librique", scope="x"))
        assert resp.status_code == 200

    def test_wrong_password_is_invalid_grant(self, anon_client):
        resp = anon_client.post("/opds/token", data=_token_form(password="wrong"))
        assert resp.status_code == 400
        assert resp.json()["error"] == "invalid_grant"

    def test_other_grant_type_is_unsupported(self, anon_client):
        resp = anon_client.post("/opds/token", data=_token_form(grant_type="client_credentials"))
        assert resp.status_code == 400
        assert resp.json()["error"] == "unsupported_grant_type"

    def test_missing_password_is_invalid_request(self, anon_client):
        resp = anon_client.post("/opds/token", data={"grant_type": "password", "username": "reader"})
        assert resp.status_code == 400
        assert resp.json()["error"] == "invalid_request"

    def test_brute_force_is_429(self, anon_client):
        for _ in range(5):
            assert anon_client.post("/opds/token", data=_token_form(password="wrong")).status_code == 400
        resp = anon_client.post("/opds/token", data=_token_form())
        assert resp.status_code == 429

    def test_shares_brute_force_protection_with_site_login(self, anon_client):
        for _ in range(5):
            anon_client.post("/api/auth/login", json={"username": "reader", "password": "wrong"})
        assert anon_client.post("/opds/token", data=_token_form()).status_code == 429


class TestNoCookies:
    def test_old_bearer_token_gets_no_cookie(self, anon_client):
        """Токен старше порога продления сайта: по Bearer куки не ставится."""
        now = datetime.now(timezone.utc)
        token = pyjwt.encode(
            {"userId": 2, "role": "reader", "tep": 0,
             "iat": now - timedelta(hours=100), "exp": now + timedelta(days=1)},
            SECRET_KEY, algorithm=JWT_ALGORITHM,
        )
        resp = anon_client.get("/opds/", headers=bearer(token))
        assert resp.status_code == 200
        assert resp.headers["content-type"] == FEED_TYPE
        assert "set-cookie" not in resp.headers
        assert COOKIE_NAME not in resp.cookies
