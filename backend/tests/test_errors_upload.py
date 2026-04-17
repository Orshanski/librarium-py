"""Gap-coverage for upload router error paths (401/403)."""
from pathlib import Path

from tests._helpers import assert_error

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_upload_unauthenticated_is_401(anon_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        resp = anon_client.post("/api/upload",
                                files={"file": ("test.fb2", f, "application/octet-stream")})
    assert_error(resp, 401)


def test_reader_cannot_upload(reader_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        resp = reader_client.post("/api/upload",
                                  files={"file": ("test.fb2", f, "application/octet-stream")})
    assert_error(resp, 403)


def test_reader_cannot_delete_temp(reader_client):
    resp = reader_client.delete("/api/uploads/abc123")
    assert_error(resp, 403)


def test_reader_cannot_create_book(reader_client):
    resp = reader_client.post("/api/books/create",
                              json={"tempId": "abc", "metadata": {}})
    assert_error(resp, 403)
