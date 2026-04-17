"""Shelves router error paths (401/404)."""
from tests._helpers import assert_error


def test_list_shelves_unauthenticated_is_401(anon_client):
    assert_error(anon_client.get("/api/shelves"), 401)


def test_get_nonexistent_shelf_is_404(reader_client):
    assert_error(reader_client.get("/api/shelves/999999"), 404)


def test_update_nonexistent_shelf_is_404(reader_client):
    assert_error(reader_client.put("/api/shelves/999999", json={"name": "x"}), 404)


def test_delete_nonexistent_shelf_is_404(reader_client):
    assert_error(reader_client.delete("/api/shelves/999999"), 404)


def test_add_book_to_nonexistent_shelf_is_404(reader_client):
    assert_error(reader_client.post("/api/shelves/999999/books",
                                    json={"bookId": 1}), 404)
