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


def test_zip_only_macos_junk_is_400(admin_client):
    """ZIP содержит только macOS-мусор без книги — после фильтра пустой → 400 «не содержит книг»."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("__MACOSX/._book.fb2", b"AppleDouble")
        zf.writestr(".DS_Store", b"Finder")
    buf.seek(0)
    resp = admin_client.post("/api/upload",
                             files={"file": ("junk.zip", buf, "application/octet-stream")})
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


def test_upload_zip_multiple_books_is_400(admin_client):
    """ZIP с несколькими книгами должен быть отклонён с 400."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("book1.fb2", b"<?xml version='1.0'?><FictionBook/>")
        zf.writestr("book2.fb2", b"<?xml version='1.0'?><FictionBook/>")
    resp = admin_client.post(
        "/api/upload",
        files={"file": ("multi.zip", buf.getvalue(), "application/zip")},
    )
    assert resp.status_code == 400
    assert "несколько" in resp.json()["detail"].lower()


def test_upload_zip_corrupted_is_400(admin_client):
    """Повреждённый ZIP должен быть отклонён с 400."""
    resp = admin_client.post(
        "/api/upload",
        files={"file": ("bad.zip", b"not actually a zip", "application/zip")},
    )
    assert resp.status_code == 400
    assert "повреждённый" in resp.json()["detail"].lower()


def test_upload_zip_oversized_inner_is_400(admin_client, monkeypatch):
    """ZIP с книгой больше MAX_BOOK_SIZE внутри должен быть отклонён с 400."""
    from app import config

    # safe_zip_read reads config.MAX_BOOK_SIZE at call time, so this patch lowers
    # the effective ceiling for the inner-book size check.
    monkeypatch.setattr(config, "MAX_BOOK_SIZE", 100)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("big.fb2", b"x" * 500)  # 500 bytes > 100
    resp = admin_client.post(
        "/api/upload",
        files={"file": ("big.zip", buf.getvalue(), "application/zip")},
    )
    assert resp.status_code == 400
