import os
import sqlite3
from pathlib import Path
from unittest.mock import patch

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_upload_fb2(admin_token):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        resp = admin_token.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["tempId"]
    assert data["metadata"]["title"] == "Minimal Test Book"
    assert "Test Author" in data["metadata"]["authors"]


def test_create_book_from_upload(admin_token):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        upload = admin_token.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    temp_id = upload.json()["tempId"]

    resp = admin_token.post("/api/books/create", json={
        "tempId": temp_id,
        "metadata": {
            "title": "New Book",
            "authors": "New Author",
            "series": "New Series",
            "seriesNumber": "1",
            "tags": "Фэнтези, Детектив",
            "language": "ru",
            "publisher": "New Press",
            "pubDate": "2026",
            "isbn": "978-0-000-00099-0",
        }
    })
    assert resp.status_code == 200
    book_id = resp.json()["bookId"]

    book = admin_token.get(f"/api/books/{book_id}").json()
    assert book["book"]["title"] == "New Book"
    assert len(book["files"]) == 1
    assert book["files"][0]["format"] == "FB2"

    test_data = os.environ["DATA_DIR"]
    assert os.path.isfile(os.path.join(test_data, "library", str(book_id), "book.fb2"))


def test_upload_epub(admin_token):
    with open(FIXTURES / "minimal.epub", "rb") as f:
        resp = admin_token.post("/api/upload", files={"file": ("test.epub", f, "application/octet-stream")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["metadata"]["title"] == "EPUB Test Book"
    assert "EPUB Author" in data["metadata"]["authors"]


def test_duplicate_detection(admin_token):
    with open(FIXTURES / "duplicate.fb2", "rb") as f:
        resp = admin_token.post("/api/upload", files={"file": ("dup.fb2", f, "application/octet-stream")})
    data = resp.json()
    assert data["duplicate"] is not None
    assert data["duplicate"]["title"] == "Minimal Test Book"


def test_create_book_rollback_on_move_failure(client):
    # Login
    client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})

    with open(FIXTURES / "minimal.fb2", "rb") as f:
        upload = client.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    temp_id = upload.json()["tempId"]

    # Используем client без raise_server_exceptions
    from starlette.testclient import TestClient
    from app.main import app
    no_raise_client = TestClient(app, raise_server_exceptions=False, cookies=client.cookies)

    with patch("app.routers.upload.shutil.move", side_effect=OSError("disk full")):
        resp = no_raise_client.post("/api/books/create", json={
            "tempId": temp_id,
            "metadata": {"title": "Should Fail", "authors": "Nobody"}
        })
    assert resp.status_code == 500

    test_data = os.environ["DATA_DIR"]
    db = sqlite3.connect(os.path.join(test_data, "db.sqlite"))
    ghost = db.execute("SELECT id FROM books WHERE title = 'Should Fail'").fetchone()
    assert ghost is None, "Книга-призрак не должна остаться в БД"

    library = os.path.join(test_data, "library")
    for d in os.listdir(library):
        book_dir_path = os.path.join(library, d)
        if os.path.isdir(book_dir_path) and not os.listdir(book_dir_path):
            assert False, f"Пустая директория-сирота: {book_dir_path}"
    db.close()


def test_reader_cannot_upload(reader_token):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        resp = reader_token.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    assert resp.status_code == 403
