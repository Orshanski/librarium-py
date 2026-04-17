"""Upload validation errors (400)."""
import io
import zipfile
from pathlib import Path
from unittest.mock import patch

from tests._helpers import assert_error

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_unsupported_format_is_400(admin_client):
    resp = admin_client.post("/api/upload",
                             files={"file": ("test.txt", b"hello", "application/octet-stream")})
    assert_error(resp, 400, message_matches="unsupported format")


def test_zip_without_books_is_400(admin_client):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.txt", "hello")
    buf.seek(0)
    resp = admin_client.post("/api/upload",
                             files={"file": ("empty.zip", buf, "application/octet-stream")})
    assert_error(resp, 400, message_matches="fb2/epub/pdf")


def test_file_size_limit_is_400(admin_client):
    with patch("app.routers.upload.MAX_BOOK_SIZE", 10):
        with open(FIXTURES / "minimal.fb2", "rb") as f:
            resp = admin_client.post(
                "/api/upload",
                files={"file": ("test.fb2", f, "application/octet-stream")},
            )
    assert_error(resp, 400)


def test_create_book_empty_title_is_400(admin_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        upload = admin_client.post("/api/upload",
                                   files={"file": ("test.fb2", f, "application/octet-stream")})
    temp_id = upload.json()["tempId"]
    resp = admin_client.post(
        "/api/books/create",
        json={"tempId": temp_id, "metadata": {"title": "", "authors": "A"}},
    )
    assert_error(resp, 400, message_matches="title required")
