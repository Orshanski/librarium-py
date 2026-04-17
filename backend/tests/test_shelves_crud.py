"""CRUD on shelves themselves."""
from tests._helpers import assert_error, assert_ok


def test_create_shelf(reader_client):
    resp = reader_client.post("/api/shelves", json={"name": "Sci-Fi"})
    data = assert_ok(resp)
    assert "id" in data


def test_list_contains_created_shelf(reader_client):
    create = reader_client.post("/api/shelves", json={"name": "Sci-Fi"})
    shelf_id = create.json()["id"]
    resp = reader_client.get("/api/shelves")
    names = {s["name"] for s in resp.json()["shelves"]}
    assert "Sci-Fi" in names


def test_get_shelf_empty(reader_client):
    shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
    resp = reader_client.get(f"/api/shelves/{shelf_id}")
    data = assert_ok(resp)
    assert data["books"] == []


def test_rename_shelf(reader_client):
    shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
    resp = reader_client.put(f"/api/shelves/{shelf_id}", json={"name": "Science Fiction"})
    assert_ok(resp)
    detail = reader_client.get(f"/api/shelves/{shelf_id}").json()
    assert detail["shelf"]["name"] == "Science Fiction"


def test_delete_shelf(reader_client):
    shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
    resp = reader_client.delete(f"/api/shelves/{shelf_id}")
    assert_ok(resp)
    resp = reader_client.get(f"/api/shelves/{shelf_id}")
    assert_error(resp, 404)


def test_book_shelves_query(reader_client):
    resp = reader_client.get("/api/shelves", params={"bookId": 1})
    data = assert_ok(resp)
    assert "bookShelves" in data
