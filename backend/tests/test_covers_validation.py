"""Cover upload validation: format, size, MIME checks."""

import glob
import os
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image

from tests._helpers import assert_error, assert_ok

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"

TINY_PNG = (Path(__file__).resolve().parent / "fixtures" / "test_cover.png").read_bytes()


def _make_jpeg(color="red", size=(20, 20)):
    img = Image.new("RGB", size, color)
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


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
        assert_error(reader_client.get("/api/covers/1"), 404)

    def test_nonexistent_book(self, reader_client):
        assert_error(reader_client.get("/api/covers/999"), 404)


# ── Covers: commit flow ──

class TestCoverCommit:
    def test_upload_and_commit(self, admin_client):
        resp = admin_client.post(
            "/api/books/2/cover",
            files={"file": ("new.png", TINY_PNG, "image/png")},
        )
        data = assert_ok(resp)
        assert "tempCoverUrl" in data

        resp = admin_client.put("/api/books/2/cover")
        assert_ok(resp)

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
        upload_data = assert_ok(upload)
        temp_url = upload_data["tempCoverUrl"]

        # temp preview is available
        resp = admin_client.get(temp_url)
        assert resp.status_code == 200

        # discard
        resp = admin_client.delete("/api/books/2/cover")
        assert_ok(resp)

        # temp preview gone
        assert_error(admin_client.get(temp_url), 404)

        # original library cover still there
        resp = admin_client.get("/api/covers/2", params={"full": 1})
        assert resp.status_code == 200


# ── Covers: validation ──

class TestCoverUploadValidation:
    def test_invalid_image_rejected(self, admin_client):
        resp = admin_client.post(
            "/api/books/2/cover",
            files={"file": ("fake.png", b"not an image at all", "image/png")},
        )
        assert_error(resp, 400, message_matches="изображением")

    def test_text_file_as_image_rejected(self, admin_client):
        resp = admin_client.post(
            "/api/books/2/cover",
            files={"file": ("cover.jpg", b"<html>hack</html>", "image/jpeg")},
        )
        assert_error(resp, 400)


# ── Covers: auth ──

class TestCoverAuth:
    def test_reader_cannot_upload_cover(self, reader_client):
        resp = reader_client.post(
            "/api/books/2/cover",
            files={"file": ("new.png", TINY_PNG, "image/png")},
        )
        assert_error(resp, 403)

    def test_reader_cannot_commit_cover(self, reader_client):
        resp = reader_client.put("/api/books/2/cover")
        assert_error(resp, 403)

    def test_reader_cannot_discard_cover(self, reader_client):
        resp = reader_client.delete("/api/books/2/cover")
        assert_error(resp, 403)

    def test_temp_preview_requires_auth(self, anon_client):
        assert_error(anon_client.get("/api/uploads/cover/2"), 401)


# ── Covers: edge cases ──

class TestCoverEdgeCases:
    def test_upload_nonexistent_book(self, admin_client):
        resp = admin_client.post(
            "/api/books/999/cover",
            files={"file": ("cover.jpg", _make_jpeg(), "image/jpeg")},
        )
        assert_error(resp, 404)

    def test_commit_nonexistent_book(self, admin_client):
        assert_error(admin_client.put("/api/books/999/cover"), 404)

    def test_commit_without_upload_is_noop(self, admin_client):
        resp = admin_client.put("/api/books/1/cover")
        data = assert_ok(resp)
        assert data == {"ok": True}

    def test_temp_preview_non_alphanumeric_id(self, reader_client):
        """После T11: Path(pattern=r'^[a-zA-Z0-9]{1,20}$') → 422 ValidationError."""
        resp = reader_client.get("/api/uploads/cover/abc-def_!@#")
        assert resp.status_code == 422

    def test_oversized_cover_rejected(self, admin_client):
        with patch("app.routers.covers.MAX_COVER_SIZE", 100):
            resp = admin_client.post(
                "/api/books/2/cover",
                files={"file": ("big.jpg", _make_jpeg(size=(200, 200)), "image/jpeg")},
            )
        assert_error(resp, 400)

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
        assert_ok(resp)

        uploads_dir = os.path.join(os.environ["DATA_DIR"], "uploads")
        temp_covers = glob.glob(os.path.join(uploads_dir, "2-cover.*"))
        assert len(temp_covers) == 1

        preview = admin_client.get("/api/uploads/cover/2")
        assert preview.status_code == 200
        assert preview.content == second_jpeg


def test_commit_move_failure_preserves_old_cover(admin_client, db):
    """При падении move во время commit старая обложка на диске сохраняется.

    Используется book_id=2: baseline seed даёт ему cover.jpg (см. seed.py:76);
    book_id=1 обложки не имеет, для этого теста не подходит. После T1
    cover_service.commit делает move+DB внутри move_with_rollback, старая
    обложка удаляется только после успеха. Мокаем move на OSError →
    проверяем что старая обложка цела и её mtime не изменился.
    """
    from app.config import LIBRARY_DIR
    from app.services import cover_service
    from app.services.cover_service import find_cover

    book_dir = Path(LIBRARY_DIR) / "2"
    old_cover_before = find_cover(str(book_dir))
    assert old_cover_before is not None, "baseline должен иметь старую обложку у book 2"
    old_mtime = (book_dir / old_cover_before).stat().st_mtime

    # Загрузить temp cover через реальный API.
    resp = admin_client.post(
        "/api/books/2/cover",
        files={"file": ("new.jpg", _make_jpeg(color="green"), "image/jpeg")},
    )
    assert resp.status_code == 200

    # Мокаем move на OSError — commit должен упасть, старая обложка сохраниться.
    with patch("app.fs_utils.shutil.move", side_effect=OSError("disk full")):
        with pytest.raises(OSError):
            cover_service.commit(db, book_id=2)

    assert (book_dir / old_cover_before).exists()
    assert (book_dir / old_cover_before).stat().st_mtime == old_mtime


def test_commit_db_failure_preserves_old_cover_same_ext(admin_client, db):
    """DB-failure при overwrite одноименного файла — старая обложка восстанавливается.

    Сценарий: у book 2 cover.jpg (baseline). Админ загружает новый jpg — dst
    совпадает со старым путём, `shutil.move` перетирает файл. Если затем
    `update_cover_path` роняет → `move_with_rollback` удаляет dst целиком,
    старая обложка должна быть восстановлена из backup'а.

    Bug был обнаружен в ветке w0g: generic move_with_rollback не знает про
    overwritten dst и удаляет всё, оставляя книгу без файла обложки, хотя
    cover_path в БД откатится. После фикса commit делает backup старого
    файла перед move и восстанавливает его при exception.
    """
    from app.config import LIBRARY_DIR
    from app.services import cover_service
    from app.services.cover_service import find_cover

    book_dir = Path(LIBRARY_DIR) / "2"
    old_cover_before = find_cover(str(book_dir))
    assert old_cover_before == "cover.jpg", "baseline: book 2 должен иметь cover.jpg"
    old_content = (book_dir / old_cover_before).read_bytes()

    resp = admin_client.post(
        "/api/books/2/cover",
        files={"file": ("new.jpg", _make_jpeg(color="green"), "image/jpeg")},
    )
    assert resp.status_code == 200

    # Mock update_cover_path → DB failure ПОСЛЕ успешного overwrite move'а.
    with patch(
        "app.services.cover_service.update_cover_path",
        side_effect=RuntimeError("simulated db failure"),
    ):
        with pytest.raises(RuntimeError):
            cover_service.commit(db, book_id=2)

    # Старая обложка должна быть на месте с оригинальным содержимым.
    assert (book_dir / "cover.jpg").exists(), "старая обложка должна быть восстановлена"
    assert (book_dir / "cover.jpg").read_bytes() == old_content, \
        "содержимое старой обложки не должно быть затёрто новым"
    # Backup не должен остаться на диске после rollback.
    assert not (book_dir / "cover.jpg.bak").exists(), \
        "bak должен быть переименован обратно в cover.jpg"
