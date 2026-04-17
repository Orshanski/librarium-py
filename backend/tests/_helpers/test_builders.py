"""Unit tests for builders."""
from pathlib import Path

from tests._helpers.builders import (
    make_user, login_client, make_shelf, make_book_via_upload,
)

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "books"


def test_login_client_admin():
    c = login_client(username="admin", password="admin123")
    resp = c.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json()["username"] == "admin"


def test_login_client_wrong_password_returns_unlogged_client():
    """Failed login must NOT raise from the builder — we return the client
    without a cookie so negative-path tests can observe 401."""
    c = login_client(username="admin", password="wrong")
    resp = c.get("/api/auth/me")
    assert resp.status_code == 401


def test_make_user_returns_id(admin_client):
    uid = make_user(admin_client, username="builder_u1", role="reader")
    assert isinstance(uid, int)
    assert uid > 0


def test_make_user_unique_per_call(admin_client):
    uid1 = make_user(admin_client, username="builder_u2")
    uid2 = make_user(admin_client, username="builder_u3")
    assert uid1 != uid2


def test_make_shelf_returns_id(reader_client):
    sid = make_shelf(reader_client, name="My Test Shelf")
    assert isinstance(sid, int)
    assert sid > 0

    resp = reader_client.get(f"/api/shelves/{sid}")
    assert resp.status_code == 200


def test_make_book_via_upload_returns_id(admin_client):
    bid = make_book_via_upload(
        admin_client,
        FIXTURES / "minimal.fb2",
        metadata={"title": "Builder Book", "authors": "Builder Author"},
    )
    assert isinstance(bid, int)
    assert bid > 0

    resp = admin_client.get(f"/api/books/{bid}")
    assert resp.status_code == 200
    assert resp.json()["book"]["title"] == "Builder Book"
