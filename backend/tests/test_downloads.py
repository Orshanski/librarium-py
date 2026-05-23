"""Book file download via GET /api/books/{id}/download.

This endpoint returns a FileResponse (binary) on success and a bare
Response(status_code=404) on failure. No JSON body. Assertions are
status-only — we can't use the JSON-based helpers here.
"""
from urllib.parse import unquote


class TestDownload:
    def test_download_fb2(self, reader_client):
        resp = reader_client.get("/api/books/1/download", params={"format": "FB2"})
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "application/octet-stream"
        assert (
            unquote(resp.headers["content-disposition"])
            == 'attachment; filename*=utf-8\'\'Minimal Test Book.fb2'
        )

    def test_download_rejects_db_file_path_for_another_book_id(self, reader_client, db):
        db.execute(
            "UPDATE book_files SET file_path = 'data/library/2/book.fb2' "
            "WHERE book_id = 1 AND format = 'FB2'"
        )
        db.commit()

        resp = reader_client.get("/api/books/1/download", params={"format": "FB2"})

        assert resp.status_code == 404

    def test_download_rejects_db_file_path_with_unsupported_extension(
        self, reader_client, db
    ):
        from app.config import LIBRARY_DIR

        (LIBRARY_DIR / "1" / "book.txt").write_bytes(b"not a supported book format")
        db.execute(
            "UPDATE book_files SET file_path = 'data/library/1/book.txt' "
            "WHERE book_id = 1 AND format = 'FB2'"
        )
        db.commit()

        resp = reader_client.get("/api/books/1/download", params={"format": "FB2"})

        assert resp.status_code == 404

    def test_download_rejects_consistently_corrupted_db_format(self, reader_client, db):
        from app.config import LIBRARY_DIR

        (LIBRARY_DIR / "1" / "book.txt").write_bytes(b"not a supported book format")
        db.execute(
            "UPDATE book_files SET format = 'TXT', file_path = 'data/library/1/book.txt' "
            "WHERE book_id = 1 AND format = 'FB2'"
        )
        db.commit()

        resp = reader_client.get("/api/books/1/download", params={"format": "TXT"})

        assert resp.status_code == 404

    def test_download_rejects_db_format_file_path_mismatch(self, reader_client, db):
        from app.config import LIBRARY_DIR

        (LIBRARY_DIR / "1" / "book.epub").write_bytes(b"epub bytes")
        db.execute(
            "UPDATE book_files SET file_path = 'data/library/1/book.epub' "
            "WHERE book_id = 1 AND format = 'FB2'"
        )
        db.commit()

        resp = reader_client.get("/api/books/1/download", params={"format": "FB2"})

        assert resp.status_code == 404

    def test_download_missing_format(self, reader_client):
        resp = reader_client.get("/api/books/1/download", params={"format": "EPUB"})
        assert resp.status_code == 404

    def test_download_nonexistent_book(self, reader_client):
        resp = reader_client.get("/api/books/999/download", params={"format": "FB2"})
        assert resp.status_code == 404
