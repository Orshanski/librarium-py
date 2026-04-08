"""Tests for covers (thumb, full, upload, commit, discard) and download."""

import glob
import os
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

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

    def test_reader_cannot_commit_cover(self, reader_client):
        resp = reader_client.put("/api/books/2/cover")
        assert resp.status_code == 403

    def test_reader_cannot_discard_cover(self, reader_client):
        resp = reader_client.delete("/api/books/2/cover")
        assert resp.status_code == 403

    def test_temp_preview_requires_auth(self, client):
        resp = client.get("/api/uploads/cover/2")
        assert resp.status_code == 401


# ── Covers: edge cases ──


def _make_jpeg(color="red", size=(20, 20)):
    img = Image.new("RGB", size, color)
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


class TestCoverEdgeCases:
    def test_upload_nonexistent_book(self, admin_client):
        resp = admin_client.post(
            "/api/books/999/cover",
            files={"file": ("cover.jpg", _make_jpeg(), "image/jpeg")},
        )
        assert resp.status_code == 404

    def test_commit_nonexistent_book(self, admin_client):
        resp = admin_client.put("/api/books/999/cover")
        assert resp.status_code == 404

    def test_commit_without_upload_is_noop(self, admin_client):
        resp = admin_client.put("/api/books/1/cover")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_temp_preview_non_alphanumeric_id(self, reader_client):
        resp = reader_client.get("/api/uploads/cover/abc-def_!@#")
        assert resp.status_code == 400

    def test_oversized_cover_rejected(self, admin_client):
        with patch("app.routers.covers.MAX_COVER_SIZE", 100):
            resp = admin_client.post(
                "/api/books/2/cover",
                files={"file": ("big.jpg", _make_jpeg(size=(200, 200)), "image/jpeg")},
            )
        assert resp.status_code == 400

    def test_upload_replaces_previous_temp(self, admin_client):
        first_jpeg = _make_jpeg(color="red")
        second_jpeg = _make_jpeg(color="blue")

        admin_client.post(
            "/api/books/2/cover",
            files={"file": ("cover1.jpg", first_jpeg, "image/jpeg")},
        )
        resp = admin_client.post(
            "/api/books/2/cover",
            files={"file": ("cover2.jpg", second_jpeg, "image/jpeg")},
        )
        assert resp.status_code == 200

        uploads_dir = os.path.join(os.environ["DATA_DIR"], "uploads")
        temp_covers = glob.glob(os.path.join(uploads_dir, "2-cover.*"))
        assert len(temp_covers) == 1

        preview = admin_client.get("/api/uploads/cover/2")
        assert preview.status_code == 200
        assert preview.content == second_jpeg


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
