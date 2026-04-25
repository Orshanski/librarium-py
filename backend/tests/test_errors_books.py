"""Gap-coverage for books router error paths (401/403/404)."""
from tests._helpers import assert_error


# --- 401 paths ---

def test_get_book_unauthenticated_is_401(anon_client):
    assert_error(anon_client.get("/api/books/1"), 401)


def test_list_books_unauthenticated_is_401(anon_client):
    assert_error(anon_client.get("/api/books"), 401)


# --- 403 paths (admin-only PUT/DELETE) ---

def test_reader_cannot_update_book(reader_client):
    assert_error(reader_client.put("/api/books/1", json={"title": "X"}), 403)


def test_reader_cannot_delete_book(reader_client):
    assert_error(reader_client.delete("/api/books/1"), 403)


# --- 404 paths ---

def test_update_nonexistent_book_is_404(admin_client):
    assert_error(admin_client.put("/api/books/999999", json={"title": "X"}),
                 404, message_matches="not found")


def test_delete_nonexistent_book_is_404(admin_client):
    assert_error(admin_client.delete("/api/books/999999"),
                 404, message_matches="not found")


def test_get_nonexistent_book_is_404(reader_client):
    assert_error(reader_client.get("/api/books/999999"),
                 404, message_matches="not found")

