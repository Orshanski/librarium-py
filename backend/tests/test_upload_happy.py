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


def test_upload_no_duplicate_for_new_book(admin_client):
    """Upload книги, которой нет в baseline — duplicate должен быть None."""
    with open(FIXTURES / "no-cover.fb2", "rb") as f:
        resp = admin_client.post("/api/upload",
                                 files={"file": ("no-cover.fb2", f, "application/octet-stream")})
    data = assert_ok(resp)
    assert data["duplicate"] is None


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
    author_names = {a["name"] for a in book["book"]["authors"]}
    assert "New Author" in author_names
    assert book["book"]["series"]["name"] == "New Series"
    assert book["book"]["seriesNumber"] == 1.0
    assert book["book"]["language"] == "ru"
    assert book["book"]["publisher"] == "New Press"
    assert len(book["files"]) == 1
    assert book["files"][0]["format"] == "FB2"

    identifiers = book.get("identifiers", [])
    isbn_values = [i["value"] for i in identifiers if i["type"] == "isbn"]
    assert "978-0-000-00099-0" in isbn_values

    tag_names = {t["name"] for t in book["book"]["tags"]}
    assert "Фэнтези" in tag_names
    assert "Детектив" in tag_names

    test_data = os.environ["DATA_DIR"]
    assert os.path.isfile(os.path.join(test_data, "library", str(bid), "book.fb2"))


def test_upload_duplicate_detection(admin_client):
    with open(FIXTURES / "duplicate.fb2", "rb") as f:
        resp = admin_client.post("/api/upload",
                                 files={"file": ("dup.fb2", f, "application/octet-stream")})
    data = assert_ok(resp)
    assert data["duplicate"] is not None
    assert data["duplicate"]["title"] == "Minimal Test Book"


def test_upload_no_cover_returns_null_cover_url(admin_client):
    with open(FIXTURES / "no-cover.fb2", "rb") as f:
        resp = admin_client.post("/api/upload",
                                 files={"file": ("no-cover.fb2", f, "application/octet-stream")})
    data = assert_ok(resp)
    assert data["metadata"]["coverUrl"] is None


def test_upload_with_cover_returns_cover_url(admin_client):
    with open(FIXTURES / "with-cover.fb2", "rb") as f:
        resp = admin_client.post("/api/upload",
                                 files={"file": ("with-cover.fb2", f, "application/octet-stream")})
    data = assert_ok(resp)
    assert data["metadata"]["coverUrl"] is not None
    assert data["metadata"]["coverUrl"].startswith("/api/uploads/cover/")


class TestBuildUploadResponseSeriesNumber:
    """Проверка форматирования seriesNumber во всех edge cases."""

    def _build(self, series_number):
        from app.parsers import ParsedMetadata
        from app.services.upload_service import _build_upload_response
        meta = ParsedMetadata(
            title="X",
            authors=[],
            series=None,
            series_number=series_number,
            description=None,
            language=None,
            genres=[],
            publisher=None,
            pub_date=None,
            isbn=None,
            cover_data=None,
            cover_ext=None,
        )
        resp = _build_upload_response(meta, temp_id="t1", ext="fb2", cover_url=None, duplicate=None)
        return resp.metadata.seriesNumber

    def test_none(self):
        assert self._build(None) == ""

    def test_zero(self):
        assert self._build(0.0) == ""

    def test_integer(self):
        assert self._build(1.0) == "1"

    def test_one_decimal(self):
        assert self._build(1.5) == "1.5"

    def test_trailing_zero(self):
        assert self._build(2.50) == "2.5"
