"""Upload happy paths: FB2, EPUB, ZIP, create book."""
import io
import os
import zipfile
from pathlib import Path

from tests._helpers import assert_ok, make_book_via_upload

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_upload_fb2(admin_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        resp = admin_client.post("/api/upload",
                                 files={"file": ("test.fb2", f, "application/octet-stream")})
    data = assert_ok(resp)
    assert data["tempId"]
    assert data["metadata"]["title"] == "Minimal Test Book"
    assert "Test Author" in data["metadata"]["authors"]


def test_upload_epub(admin_client):
    with open(FIXTURES / "minimal.epub", "rb") as f:
        resp = admin_client.post("/api/upload",
                                 files={"file": ("test.epub", f, "application/octet-stream")})
    data = assert_ok(resp)
    assert data["metadata"]["title"] == "EPUB Test Book"
    assert "EPUB Author" in data["metadata"]["authors"]


def test_upload_zip(admin_client):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.write(FIXTURES / "minimal.fb2", "book.fb2")
    buf.seek(0)
    resp = admin_client.post("/api/upload",
                             files={"file": ("books.zip", buf, "application/octet-stream")})
    data = assert_ok(resp)
    assert data["format"] == "FB2"
    assert data["metadata"]["title"] == "Minimal Test Book"


def test_create_book_end_to_end(admin_client):
    bid = make_book_via_upload(
        admin_client, FIXTURES / "minimal.fb2",
        metadata={
            "title": "New Book", "authors": "New Author",
            "series": "New Series", "seriesNumber": "1",
            "tags": "Фэнтези, Детектив",
            "language": "ru", "publisher": "New Press",
            "pubDate": "2026", "isbn": "978-0-000-00099-0",
        },
    )

    book = assert_ok(admin_client.get(f"/api/books/{bid}"))
    assert book["book"]["title"] == "New Book"
    assert "New Author" in book["book"]["authors"]
    assert book["book"]["series_name"] == "New Series"
    assert book["book"]["series_number"] == 1.0
    assert book["book"]["language"] == "ru"
    assert book["book"]["publisher"] == "New Press"
    assert len(book["files"]) == 1
    assert book["files"][0]["format"] == "FB2"

    identifiers = book.get("identifiers", [])
    isbn_values = [i["value"] for i in identifiers if i["type"] == "isbn"]
    assert "978-0-000-00099-0" in isbn_values

    assert "Фэнтези" in book["book"]["tags"]
    assert "Детектив" in book["book"]["tags"]

    test_data = os.environ["DATA_DIR"]
    assert os.path.isfile(os.path.join(test_data, "library", str(bid), "book.fb2"))


def test_upload_duplicate_detection(admin_client):
    with open(FIXTURES / "duplicate.fb2", "rb") as f:
        resp = admin_client.post("/api/upload",
                                 files={"file": ("dup.fb2", f, "application/octet-stream")})
    data = assert_ok(resp)
    assert data["duplicate"] is not None
    assert data["duplicate"]["title"] == "Minimal Test Book"
