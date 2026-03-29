"""Tests for covers (thumb, full, upload, commit, discard) and download."""

import os
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"

# Minimal 1x1 PNG for cover upload
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
    b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


# ── Covers: GET ──

class TestCoverGet:
    def test_full(self, client):
        resp = client.get("/api/covers/2", params={"full": 1})
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").startswith("image/")

    def test_no_cover(self, client):
        resp = client.get("/api/covers/1")
        assert resp.status_code == 404

    def test_nonexistent_book(self, client):
        resp = client.get("/api/covers/999")
        assert resp.status_code == 404


# ── Covers: commit flow ──

class TestCoverCommit:
    def test_upload_and_commit(self, admin_client):
        resp = admin_client.post(
            "/api/books/2/cover",
            files={"file": ("new.png", TINY_PNG, "image/png")},
        )
        assert resp.status_code == 200
        assert "tempCoverUrl" in resp.json()

        resp = admin_client.put("/api/books/2/cover")
        assert resp.status_code == 200

        # verify cover exists on disk (full=1 skips PIL thumb)
        resp = admin_client.get("/api/covers/2", params={"full": 1})
        assert resp.status_code == 200


# ── Covers: discard flow ──

class TestCoverDiscard:
    def test_upload_and_discard(self, admin_client):
        upload = admin_client.post(
            "/api/books/2/cover",
            files={"file": ("new.png", TINY_PNG, "image/png")},
        )
        temp_url = upload.json()["tempCoverUrl"]

        # temp preview is available
        resp = admin_client.get(temp_url)
        assert resp.status_code == 200

        # discard
        resp = admin_client.delete("/api/books/2/cover")
        assert resp.status_code == 200

        # temp preview gone
        resp = admin_client.get(temp_url)
        assert resp.status_code == 404

        # original library cover still there
        resp = admin_client.get("/api/covers/2", params={"full": 1})
        assert resp.status_code == 200


# ── Covers: auth ──

class TestCoverAuth:
    def test_reader_cannot_upload_cover(self, reader_client):
        resp = reader_client.post(
            "/api/books/2/cover",
            files={"file": ("new.png", TINY_PNG, "image/png")},
        )
        assert resp.status_code == 403


# ── Download ──

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
