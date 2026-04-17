"""Gap-coverage for books router error paths (401/403/404/400/409)."""
import io

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


# --- 400 paths (validation) ---

def test_delete_file_without_format_param_is_400(admin_client):
    resp = admin_client.delete("/api/books/1/files")
    assert_error(resp, 400, message_matches="format required")


def test_upload_unsupported_format_to_book_is_400(admin_client):
    resp = admin_client.post(
        "/api/books/1/files",
        files={"file": ("bad.xyz", b"content", "application/octet-stream")},
    )
    assert_error(resp, 400, message_matches="unsupported")


# --- 409 paths (duplicate format) ---

def test_add_duplicate_format_is_409(admin_client):
    """Book 1 already has FB2 (baseline). Uploading another FB2 → 409."""
    fake_fb2 = b'<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>x</book-title></title-info></description><body><section><p>x</p></section></body></FictionBook>'
    resp = admin_client.post(
        "/api/books/1/files",
        files={"file": ("book.fb2", io.BytesIO(fake_fb2), "application/octet-stream")},
    )
    assert_error(resp, 409)
