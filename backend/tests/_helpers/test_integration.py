"""Integration smoke: helpers used together, end-to-end shape."""
from pathlib import Path

from tests._helpers import (
    assert_error, assert_ok, assert_not_found,
    login_client, make_user, make_shelf, make_book_via_upload,
    count_rows, row_exists,
)

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "books"


def test_full_book_flow(admin_client, db_test):
    bid = make_book_via_upload(
        admin_client, FIXTURES / "minimal.fb2",
        metadata={"title": "Smoke Book"},
    )
    assert row_exists(db_test, "books", "id = ?", (bid,))

    resp = admin_client.get(f"/api/books/{bid}")
    data = assert_ok(resp)
    assert data["book"]["title"] == "Smoke Book"


def test_full_user_shelf_flow(admin_client, db_test):
    uid = make_user(admin_client, username="smokeuser")
    assert row_exists(db_test, "users", "id = ?", (uid,))

    client = login_client(username="smokeuser", password="p@ss")
    sid = make_shelf(client, name="Smoke Shelf")
    assert row_exists(db_test, "shelves", "id = ?", (sid,))


def test_assert_not_found_on_missing_book(admin_client):
    """Expected-red until E1: current endpoint returns {error: Not found};
    assert_not_found expects {detail: ...}. Captures the contract gap."""
    resp = admin_client.get("/api/books/999999")
    assert_not_found(resp, message_matches="not found")
