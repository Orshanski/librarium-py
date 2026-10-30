"""Скачивание книг и обложки под /opds/: Bearer, докачка, имя файла, медиатип."""
from pathlib import Path

import pytest

from tests._helpers.opds import AUTH_TYPE


@pytest.fixture
def book1_bytes():
    from app.config import LIBRARY_DIR
    return Path(LIBRARY_DIR / "1" / "book.fb2").read_bytes()


class TestDownload:
    def test_media_type_and_file_name(self, anon_client, opds_headers, book1_bytes):
        resp = anon_client.get("/opds/books/1/download", params={"format": "fb2"}, headers=opds_headers)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/x-fictionbook+xml"
        assert resp.headers["content-disposition"] == "attachment; filename*=utf-8''Minimal%20Test%20Book.fb2"
        assert resp.content == book1_bytes
        assert "set-cookie" not in resp.headers

    def test_range(self, anon_client, opds_headers, book1_bytes):
        resp = anon_client.get(
            "/opds/books/1/download", params={"format": "fb2"},
            headers={**opds_headers, "Range": "bytes=10-19"},
        )
        assert resp.status_code == 206
        assert resp.headers["content-range"] == f"bytes 10-19/{len(book1_bytes)}"
        assert resp.content == book1_bytes[10:20]

    def test_non_ascii_file_name(self, anon_client, opds_headers, db):
        db.execute("UPDATE books SET title = 'Тест' WHERE id = 1")
        db.commit()
        resp = anon_client.get("/opds/books/1/download", params={"format": "fb2"}, headers=opds_headers)
        assert resp.headers["content-disposition"] == "attachment; filename*=utf-8''%D0%A2%D0%B5%D1%81%D1%82.fb2"

    def test_missing_format_is_404(self, anon_client, opds_headers):
        resp = anon_client.get("/opds/books/1/download", params={"format": "epub"}, headers=opds_headers)
        assert resp.status_code == 404

    def test_requires_token(self, anon_client):
        resp = anon_client.get("/opds/books/1/download", params={"format": "fb2"})
        assert resp.status_code == 401
        assert resp.headers["content-type"] == AUTH_TYPE


class TestCovers:
    @pytest.mark.parametrize("ext, fmt, media_type", [
        ("png", "PNG", "image/png"),
        ("webp", "WEBP", "image/webp"),
    ])
    def test_full_cover_not_jpeg(self, anon_client, opds_headers, db, ext, fmt, media_type):
        from PIL import Image
        from app.config import LIBRARY_DIR
        book_dir = LIBRARY_DIR / "2"
        (book_dir / "cover.jpg").unlink()
        Image.new("RGB", (100, 150), color=(10, 20, 30)).save(book_dir / f"cover.{ext}", fmt)
        db.execute("UPDATE books SET cover_path = ? WHERE id = 2", (f"data/library/2/cover.{ext}",))
        db.commit()

        feed = anon_client.get("/opds/books", headers=opds_headers).json()
        pub = next(p for p in feed["publications"] if p["metadata"]["title"] == "Book With Cover")
        full_image = pub["images"][1]
        assert full_image["type"] == media_type

        full = anon_client.get(full_image["href"], headers=opds_headers)
        assert full.status_code == 200
        assert full.headers["content-type"] == media_type

    def test_thumbnail_and_full(self, anon_client, opds_headers):
        thumb = anon_client.get("/opds/covers/2", params={"t": "x"}, headers=opds_headers)
        assert thumb.status_code == 200
        assert thumb.headers["content-type"] == "image/jpeg"
        full = anon_client.get("/opds/covers/2", params={"full": 1, "t": "x"}, headers=opds_headers)
        assert full.status_code == 200
        assert full.headers["content-type"] == "image/jpeg"

    @pytest.mark.parametrize("params", [{"t": "x"}, {"full": 1, "t": "x"}])
    def test_cover_is_kept_without_expiry(self, anon_client, opds_headers, params):
        # Адрес обложки в ленте несёт версию (?t=), замена обложки его меняет
        resp = anon_client.get("/opds/covers/2", params=params, headers=opds_headers)
        assert resp.headers["cache-control"] == "public, max-age=31536000, immutable"

    def test_book_without_cover_is_404(self, anon_client, opds_headers):
        assert anon_client.get("/opds/covers/1", headers=opds_headers).status_code == 404

    def test_requires_token(self, anon_client):
        resp = anon_client.get("/opds/covers/2")
        assert resp.status_code == 401
        assert resp.headers["content-type"] == AUTH_TYPE
