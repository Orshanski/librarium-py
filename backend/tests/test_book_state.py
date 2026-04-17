"""Per-book user state: rating, read status, hidden flag."""
from tests._helpers import assert_ok


def test_set_rating(reader_client):
    resp = reader_client.put("/api/books/3/rating", json={"rating": 4})
    assert_ok(resp)
    book = reader_client.get("/api/books/3").json()["book"]
    assert book["rating"] == 4


def test_clear_rating(reader_client):
    reader_client.put("/api/books/3/rating", json={"rating": 4})
    resp = reader_client.put("/api/books/3/rating", json={"rating": None})
    assert_ok(resp)
    book = reader_client.get("/api/books/3").json()["book"]
    assert book["rating"] is None


def test_rating_lower_bound(reader_client):
    resp = reader_client.put("/api/books/3/rating", json={"rating": 1})
    assert_ok(resp)
    book = reader_client.get("/api/books/3").json()["book"]
    assert book["rating"] == 1


def test_rating_too_high(reader_client):
    resp = reader_client.put("/api/books/3/rating", json={"rating": 6})
    assert resp.status_code == 422


def test_rating_too_low(reader_client):
    resp = reader_client.put("/api/books/3/rating", json={"rating": 0})
    assert resp.status_code == 422


def test_set_read(reader_client):
    resp = reader_client.put("/api/books/3/read", json={"isRead": True})
    assert_ok(resp)
    book = reader_client.get("/api/books/3").json()["book"]
    assert book["is_read"] == 1


def test_set_hidden(reader_client, db):
    resp = reader_client.put("/api/books/3/hidden", json={"isHidden": True})
    assert_ok(resp)
    from app.dal.user_books import get_user_book
    ub = get_user_book(db, 2, 3)  # reader user_id=2
    assert ub["is_hidden"] == 1


def test_hidden_excludes_from_catalog(reader_client):
    reader_client.put("/api/books/3/hidden", json={"isHidden": True})
    resp = reader_client.get("/api/books")
    ids = {b["id"] for b in resp.json()["books"]}
    assert 3 not in ids


def test_unhide_restores_to_catalog(reader_client):
    reader_client.put("/api/books/3/hidden", json={"isHidden": True})
    reader_client.put("/api/books/3/hidden", json={"isHidden": False})
    resp = reader_client.get("/api/books")
    ids = {b["id"] for b in resp.json()["books"]}
    assert 3 in ids


def test_default_is_read_null(reader_client):
    book = reader_client.get("/api/books/3").json()["book"]
    assert book["is_read"] is None or book["is_read"] == 0


def test_default_rating_null(reader_client):
    book = reader_client.get("/api/books/3").json()["book"]
    assert book["rating"] is None


def test_book_detail_has_is_read(reader_client):
    book = reader_client.get("/api/books/1").json()["book"]
    assert "is_read" in book


def test_book_detail_reflects_read(reader_client):
    reader_client.put("/api/books/3/read", json={"isRead": True})
    book = reader_client.get("/api/books/3").json()["book"]
    assert book["is_read"] == 1


def test_book_detail_has_rating(reader_client):
    reader_client.put("/api/books/3/rating", json={"rating": 4})
    book = reader_client.get("/api/books/3").json()["book"]
    assert book["rating"] == 4


def test_catalog_has_is_read(reader_client):
    reader_client.put("/api/books/1/read", json={"isRead": True})
    data = reader_client.get("/api/books").json()
    book = next(b for b in data["books"] if b["id"] == 1)
    assert book["is_read"] == 1
