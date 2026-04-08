import io
import os
import sqlite3
import zipfile
from pathlib import Path
from unittest.mock import patch

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_upload_fb2(admin_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        resp = admin_client.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["tempId"]
    assert data["metadata"]["title"] == "Minimal Test Book"
    assert "Test Author" in data["metadata"]["authors"]


def test_create_book_from_upload(admin_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        upload = admin_client.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    temp_id = upload.json()["tempId"]

    resp = admin_client.post("/api/books/create", json={
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

    book = admin_client.get(f"/api/books/{book_id}").json()
    assert book["book"]["title"] == "New Book"
    assert "New Author" in book["book"]["authors"]
    assert book["book"]["series_name"] == "New Series"
    assert book["book"]["series_number"] == 1.0
    assert book["book"]["language"] == "ru"
    assert book["book"]["publisher"] == "New Press"
    assert len(book["files"]) == 1
    assert book["files"][0]["format"] == "FB2"

    # ISBN
    identifiers = book.get("identifiers", [])
    isbn_values = [i["value"] for i in identifiers if i["type"] == "isbn"]
    assert "978-0-000-00099-0" in isbn_values

    # Теги
    assert "Фэнтези" in book["book"]["tags"]
    assert "Детектив" in book["book"]["tags"]

    # Файл на диске
    test_data = os.environ["DATA_DIR"]
    assert os.path.isfile(os.path.join(test_data, "library", str(book_id), "book.fb2"))


def test_upload_epub(admin_client):
    with open(FIXTURES / "minimal.epub", "rb") as f:
        resp = admin_client.post("/api/upload", files={"file": ("test.epub", f, "application/octet-stream")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["metadata"]["title"] == "EPUB Test Book"
    assert "EPUB Author" in data["metadata"]["authors"]


def test_duplicate_detection(admin_client):
    with open(FIXTURES / "duplicate.fb2", "rb") as f:
        resp = admin_client.post("/api/upload", files={"file": ("dup.fb2", f, "application/octet-stream")})
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
    no_raise_client.headers.update({"X-Requested-With": "XMLHttpRequest"})

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


def test_reader_cannot_upload(reader_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        resp = reader_client.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    assert resp.status_code == 403


# ── Upload edge cases ──

def test_unsupported_format(admin_client):
    resp = admin_client.post("/api/upload", files={"file": ("test.txt", b"hello", "application/octet-stream")})
    assert resp.status_code == 400
    assert "Unsupported format" in resp.json()["error"]


def test_create_book_empty_title(admin_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        upload = admin_client.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    temp_id = upload.json()["tempId"]
    resp = admin_client.post("/api/books/create", json={
        "tempId": temp_id,
        "metadata": {"title": "", "authors": "Author"}
    })
    assert resp.status_code == 400
    assert "Title required" in resp.json()["error"]


def test_file_size_limit(admin_client):
    with patch("app.routers.upload.MAX_BOOK_SIZE", 10):
        with open(FIXTURES / "minimal.fb2", "rb") as f:
            resp = admin_client.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    assert resp.status_code == 400


def test_zip_upload(admin_client):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.write(FIXTURES / "minimal.fb2", "book.fb2")
    buf.seek(0)
    resp = admin_client.post("/api/upload", files={"file": ("books.zip", buf, "application/octet-stream")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["format"] == "FB2"
    assert data["metadata"]["title"] == "Minimal Test Book"


def test_zip_no_books(admin_client):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.txt", "hello")
    buf.seek(0)
    resp = admin_client.post("/api/upload", files={"file": ("empty.zip", buf, "application/octet-stream")})
    assert resp.status_code == 400
    assert "ZIP не содержит книг (fb2/epub/pdf)" in resp.json()["error"]


# ── Cleanup temp ──

def test_cleanup_temp(admin_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        upload = admin_client.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    temp_id = upload.json()["tempId"]
    uploads_dir = os.path.join(os.environ["DATA_DIR"], "uploads")
    temp_files = [f for f in os.listdir(uploads_dir) if f.startswith(temp_id)]
    assert len(temp_files) > 0

    resp = admin_client.delete(f"/api/uploads/{temp_id}")
    assert resp.status_code == 200
    remaining = [f for f in os.listdir(uploads_dir) if f.startswith(temp_id)]
    assert remaining == []


def test_cleanup_temp_idempotent(admin_client):
    resp = admin_client.delete("/api/uploads/nonexist1")
    assert resp.status_code == 200


# ── Concurrent uploads ──


def _make_admin_client():
    """Create a fresh TestClient with admin login (thread-safe)."""
    from starlette.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    c.headers.update({"X-Requested-With": "XMLHttpRequest"})
    c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return c


def _upload_fb2(client):
    """Upload minimal.fb2 and return response JSON."""
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        resp = client.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
    return resp.json()


def _upload_worker():
    """Worker for concurrent tests: create client, upload, cleanup thread-local DB."""
    c = _make_admin_client()
    try:
        return _upload_fb2(c)
    finally:
        from app.database import reset_db
        reset_db()


class TestConcurrentUploads:
    def test_parallel_uploads_unique_temp_ids(self):
        from concurrent.futures import ThreadPoolExecutor

        # 3 workers: enough to detect collisions, low enough to not overwhelm test SQLite
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: _upload_worker(), range(3)))

        temp_ids = [r["tempId"] for r in results]
        assert len(set(temp_ids)) == 3, f"Expected 3 unique tempIds, got: {temp_ids}"

    def test_parallel_uploads_files_dont_collide(self):
        from concurrent.futures import ThreadPoolExecutor

        def worker():
            data = _upload_worker()
            return data["tempId"]

        with ThreadPoolExecutor(max_workers=3) as pool:
            temp_ids = list(pool.map(lambda _: worker(), range(3)))

        uploads_dir = os.path.join(os.environ["DATA_DIR"], "uploads")
        for tid in temp_ids:
            matching = [f for f in os.listdir(uploads_dir) if f.startswith(tid + ".")]
            assert len(matching) == 1, f"Expected 1 file for {tid}, found: {matching}"

    def test_cleanup_does_not_affect_other_upload(self, admin_client):
        with open(FIXTURES / "minimal.fb2", "rb") as f:
            upload_a = admin_client.post("/api/upload", files={"file": ("a.fb2", f, "application/octet-stream")})
        with open(FIXTURES / "minimal.fb2", "rb") as f:
            upload_b = admin_client.post("/api/upload", files={"file": ("b.fb2", f, "application/octet-stream")})

        tid_a = upload_a.json()["tempId"]
        tid_b = upload_b.json()["tempId"]

        admin_client.delete(f"/api/uploads/{tid_a}")

        uploads_dir = os.path.join(os.environ["DATA_DIR"], "uploads")
        a_files = [f for f in os.listdir(uploads_dir) if f.startswith(tid_a + ".") or f.startswith(tid_a + "-cover.")]
        b_files = [f for f in os.listdir(uploads_dir) if f.startswith(tid_b + ".") or f.startswith(tid_b + "-cover.")]
        assert a_files == [], f"Cleanup should have removed all files for {tid_a}"
        assert len(b_files) >= 1, f"Files for {tid_b} should still exist"
