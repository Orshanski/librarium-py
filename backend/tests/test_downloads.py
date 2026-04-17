"""Book file download via GET /api/books/{id}/download.

This endpoint returns a FileResponse (binary) on success and a bare
Response(status_code=404) on failure. No JSON body. Assertions are
status-only — we can't use the JSON-based helpers here.
"""


class TestDownload:
    def test_download_fb2(self, reader_client):
        resp = reader_client.get("/api/books/1/download", params={"format": "FB2"})
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "application/octet-stream"

    def test_download_missing_format(self, reader_client):
        resp = reader_client.get("/api/books/1/download", params={"format": "EPUB"})
        assert resp.status_code == 404

    def test_download_nonexistent_book(self, reader_client):
        resp = reader_client.get("/api/books/999/download", params={"format": "FB2"})
        assert resp.status_code == 404
