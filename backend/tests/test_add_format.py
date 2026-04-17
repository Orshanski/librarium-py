import os
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from tests._helpers import assert_error, assert_ok, connect_test_db

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_add_format_happy_path(admin_client):
    """Добавить EPUB к существующей FB2-книге."""
    # Upload EPUB
    with open(FIXTURES / "minimal.epub", "rb") as f:
        upload = admin_client.post("/api/upload", files={"file": ("test.epub", f, "application/octet-stream")})
    data = assert_ok(upload)
    temp_id = data["tempId"]

    # Add format to book 1 (имеет FB2)
    resp = admin_client.post("/api/books/1/add-format", json={"tempId": temp_id})
    result = assert_ok(resp)
    assert result["format"] == "EPUB"

    # Проверить в БД
    test_data = os.environ["DATA_DIR"]
    db = connect_test_db()
    try:
        formats = [r[0] for r in db.execute("SELECT format FROM book_files WHERE book_id = 1").fetchall()]
        assert "FB2" in formats
        assert "EPUB" in formats
    finally:
        db.close()

    # Проверить файл на диске
    assert os.path.isfile(os.path.join(test_data, "library", "1", "book.epub"))


def test_add_format_duplicate_rejected(admin_client):
    """Нельзя добавить формат который уже есть."""
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        upload = admin_client.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    data = assert_ok(upload)
    temp_id = data["tempId"]

    # Книга 1 уже имеет FB2
    resp = admin_client.post("/api/books/1/add-format", json={"tempId": temp_id})
    assert_error(resp, 409)


def test_add_format_nonexistent_book(admin_client):
    """Нельзя добавить формат к несуществующей книге."""
    with open(FIXTURES / "minimal.epub", "rb") as f:
        upload = admin_client.post("/api/upload", files={"file": ("test.epub", f, "application/octet-stream")})
    data = assert_ok(upload)
    temp_id = data["tempId"]

    resp = admin_client.post("/api/books/999/add-format", json={"tempId": temp_id})
    assert_error(resp, 404)


def test_add_format_rollback_on_move_failure(client):
    """При ошибке shutil.move — БД не меняется, сиротских файлов нет."""
    client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})

    with open(FIXTURES / "minimal.epub", "rb") as f:
        upload = client.post("/api/upload", files={"file": ("test.epub", f, "application/octet-stream")})
    data = assert_ok(upload)
    temp_id = data["tempId"]

    from app.main import app
    no_raise = TestClient(app, raise_server_exceptions=False, cookies=client.cookies)
    no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})

    with patch("app.services.upload_service.shutil.move", side_effect=OSError("disk full")):
        resp = no_raise.post("/api/books/1/add-format", json={"tempId": temp_id})
    assert_error(resp, 500)

    # Сиротский файл не должен остаться
    test_data = os.environ["DATA_DIR"]
    assert not os.path.exists(os.path.join(test_data, "library", "1", "book.epub")), \
        "Сиротский файл не должен остаться после rollback"

    # В БД по-прежнему только FB2
    db = connect_test_db()
    try:
        formats = [r[0] for r in db.execute("SELECT format FROM book_files WHERE book_id = 1").fetchall()]
        assert formats == ["FB2"]
    finally:
        db.close()


# ── Delete format ──

def test_delete_format(admin_client):
    test_data = os.environ["DATA_DIR"]
    assert os.path.isfile(os.path.join(test_data, "library", "1", "book.fb2"))

    resp = admin_client.delete("/api/books/1/files", params={"format": "FB2"})
    assert_ok(resp)

    db = connect_test_db()
    try:
        formats = [r[0] for r in db.execute("SELECT format FROM book_files WHERE book_id = 1").fetchall()]
        assert "FB2" not in formats
    finally:
        db.close()

    assert not os.path.isfile(os.path.join(test_data, "library", "1", "book.fb2"))


def test_delete_format_missing_param(admin_client):
    resp = admin_client.delete("/api/books/1/files")
    assert_error(resp, 400, message_matches="format required")


def test_delete_format_nonexistent(admin_client):
    resp = admin_client.delete("/api/books/1/files", params={"format": "PDF"})
    assert_error(resp, 404)
