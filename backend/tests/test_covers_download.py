"""Tests for covers (thumb, full, upload, commit, discard) and download."""

import os
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"

TINY_PNG = (Path(__file__).resolve().parent / "fixtures" / "test_cover.png").read_bytes()


# ── Covers: GET ──

class TestCoverGet:
    def test_thumb(self, reader_client):
        resp = reader_client.get("/api/covers/2")
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "") == "image/jpeg"

    def test_full(self, reader_client):
        resp = reader_client.get("/api/covers/2", params={"full": 1})
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").startswith("image/")

    def test_no_cover(self, reader_client):
        resp = reader_client.get("/api/covers/1")
        assert resp.status_code == 404

    def test_nonexistent_book(self, reader_client):
        resp = reader_client.get("/api/covers/999")
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

class TestCoverValidation:
    def test_invalid_image_rejected(self, admin_client):
        resp = admin_client.post(
            "/api/books/2/cover",
            files={"file": ("fake.png", b"not an image at all", "image/png")},
        )
        assert resp.status_code == 400
        assert "изображением" in resp.json()["error"]

    def test_text_file_as_image_rejected(self, admin_client):
        resp = admin_client.post(
            "/api/books/2/cover",
            files={"file": ("cover.jpg", b"<html>hack</html>", "image/jpeg")},
        )
        assert resp.status_code == 400


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
