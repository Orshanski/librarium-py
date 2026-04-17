"""Book-on-shelf: add, remove, list."""
from tests._helpers import assert_ok


def book_ids(books):
    return {b["id"] for b in books}


def test_add_book_to_shelf(reader_client):
    shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
    resp = reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1})
    assert_ok(resp)
    detail = reader_client.get(f"/api/shelves/{shelf_id}").json()
    assert book_ids(detail["books"]) == {1}


def test_remove_book_from_shelf(reader_client):
    shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
    reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1})
    resp = reader_client.delete(f"/api/shelves/{shelf_id}/books/1")
    assert_ok(resp)
    detail = reader_client.get(f"/api/shelves/{shelf_id}").json()
    assert detail["books"] == []


def test_add_book_idempotent(reader_client):
    shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
    reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1})
    resp = reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1})
    assert_ok(resp)
    detail = reader_client.get(f"/api/shelves/{shelf_id}").json()
    assert len(detail["books"]) == 1
