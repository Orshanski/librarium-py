"""Integration tests для расширенного PUT /api/books/{id} (apply-edit flow).

См. spec 2026-04-24-book-format-staging-design.md §7.
"""
# Staged imports для Tasks 3-9: `logging`/`shutil`/`patch` — rollback-тесты,
# `TestClient` — custom no_raise клиент, `assert_error`/`connect_test_db` —
# error-path и DB-ассерты. Plan 2026-04-24-book-format-staging.md.
import glob
import logging  # noqa: F401  # used in Task 5 caplog tests
import os  # noqa: F401  # used in Task 4+ FS assertions
import shutil  # noqa: F401  # used in Task 9 rollback mock
from pathlib import Path
from unittest.mock import patch  # noqa: F401  # used in Task 9 mocking

from fastapi.testclient import TestClient

from tests._helpers import assert_error, assert_ok, connect_test_db  # noqa: F401  # assert_error/connect_test_db staged for Tasks 4-9

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def _upload_temp(admin_client: TestClient, filename: str) -> str:
    """Helper: загружает файл через POST /api/upload, возвращает tempId."""
    with open(FIXTURES / filename, "rb") as f:
        upload = admin_client.post(
            "/api/upload",
            files={"file": (filename, f, "application/octet-stream")},
        )
    return assert_ok(upload)["tempId"]


def test_update_book_no_op(admin_client):
    """Защитный edge case: PUT без metadata/массивов/commitCover → 200 OK.

    Штатный клиентский Save всегда шлёт полные metadata (BookEditPage.handleSave),
    так что этот тест проверяет защитную ветку — не штатный flow.
    """
    resp = admin_client.put("/api/books/1", json={})
    assert_ok(resp)


def test_update_book_add_formats_happy(admin_client):
    """PUT с addFormats: [tempId] → файл в library, book_files обновлён, tempId удалён."""
    test_data = os.environ["DATA_DIR"]
    temp_id = _upload_temp(admin_client, "minimal.epub")

    assert os.path.exists(os.path.join(test_data, "uploads", f"{temp_id}.epub"))

    resp = admin_client.put("/api/books/1", json={"addFormats": [temp_id]})
    assert_ok(resp)

    db = connect_test_db()
    try:
        formats = [r[0] for r in db.execute(
            "SELECT format FROM book_files WHERE book_id = 1"
        ).fetchall()]
    finally:
        db.close()
    assert "EPUB" in formats

    assert os.path.isfile(os.path.join(test_data, "library", "1", "book.epub"))
    assert not os.path.exists(os.path.join(test_data, "uploads", f"{temp_id}.epub"))


def test_update_book_delete_formats_happy(admin_client):
    """PUT с deleteFormats: ['FB2'] → файл и DAL-запись удалены."""
    test_data = os.environ["DATA_DIR"]
    assert os.path.isfile(os.path.join(test_data, "library", "1", "book.fb2"))

    resp = admin_client.put("/api/books/1", json={"deleteFormats": ["FB2"]})
    assert_ok(resp)

    db = connect_test_db()
    try:
        formats = [r[0] for r in db.execute(
            "SELECT format FROM book_files WHERE book_id = 1"
        ).fetchall()]
    finally:
        db.close()
    assert "FB2" not in formats
    assert not os.path.isfile(os.path.join(test_data, "library", "1", "book.fb2"))


def test_update_book_delete_nonexistent_format_idempotent(admin_client, caplog):
    """deleteFormats: ['XYZ'] (valid code, not present) → 200 OK, log.info, остальные поля применились."""
    with caplog.at_level(logging.INFO, logger="librarium.services.books"):
        resp = admin_client.put(
            "/api/books/1",
            json={"deleteFormats": ["XYZ"], "description": "updated via idempotent test"},
        )
    assert_ok(resp)
    assert any("idempotent delete skipped" in r.message for r in caplog.records)

    db = connect_test_db()
    try:
        desc = db.execute(
            "SELECT description FROM books WHERE id=1"
        ).fetchone()[0]
    finally:
        db.close()
    assert desc == "updated via idempotent test"


def test_update_book_commit_cover_happy(admin_client):
    """commitCover: true применяет pending cover, temp-cover удалён."""
    test_data = os.environ["DATA_DIR"]

    with open(FIXTURES / "../test_cover.png", "rb") as f:
        upload = admin_client.post(
            "/api/books/2/cover",
            files={"file": ("new.png", f, "image/png")},
        )
    assert_ok(upload)

    resp = admin_client.put("/api/books/2", json={"commitCover": True})
    assert_ok(resp)

    get_resp = admin_client.get("/api/covers/2", params={"full": 1})
    assert get_resp.status_code == 200

    uploads_dir = os.path.join(test_data, "uploads")
    temp_covers = glob.glob(os.path.join(uploads_dir, "2-cover.*"))
    assert temp_covers == [], f"Temp cover должен быть удалён: {temp_covers}"


# ---------------------------------------------------------------------------
# Task 7: Combo + replace_format tests
# ---------------------------------------------------------------------------

def test_update_book_combo(admin_client):
    """Metadata + addFormats + deleteFormats + commitCover — всё применилось."""
    test_data = os.environ["DATA_DIR"]
    temp_id = _upload_temp(admin_client, "minimal.epub")

    with open(FIXTURES / "../test_cover.png", "rb") as f:
        admin_client.post("/api/books/1/cover", files={"file": ("new.png", f, "image/png")})

    resp = admin_client.put("/api/books/1", json={
        "title": "Combo Title",
        "addFormats": [temp_id],
        "deleteFormats": ["FB2"],
        "commitCover": True,
    })
    assert_ok(resp)

    db = connect_test_db()
    try:
        row = db.execute("SELECT title FROM books WHERE id=1").fetchone()
        formats = [r[0] for r in db.execute(
            "SELECT format FROM book_files WHERE book_id = 1"
        ).fetchall()]
    finally:
        db.close()
    assert row[0] == "Combo Title"
    assert "EPUB" in formats
    assert "FB2" not in formats
    assert not os.path.isfile(os.path.join(test_data, "library", "1", "book.fb2"))


def test_update_book_replace_format(admin_client):
    """deleteFormats: ['FB2'] + addFormats: [tempId_fb2] — delete перед add."""
    test_data = os.environ["DATA_DIR"]
    temp_id = _upload_temp(admin_client, "minimal.fb2")

    resp = admin_client.put("/api/books/1", json={
        "deleteFormats": ["FB2"],
        "addFormats": [temp_id],
    })
    assert_ok(resp)

    db = connect_test_db()
    try:
        formats = [r[0] for r in db.execute(
            "SELECT format FROM book_files WHERE book_id = 1"
        ).fetchall()]
    finally:
        db.close()
    assert formats.count("FB2") == 1
    assert os.path.isfile(os.path.join(test_data, "library", "1", "book.fb2"))


# ---------------------------------------------------------------------------
# Task 8: Validation tests
# ---------------------------------------------------------------------------

def test_update_book_add_invalid_tempid(admin_client):
    resp = admin_client.put("/api/books/1", json={"addFormats": ["doesnotexistab"]})
    assert_error(resp, 400, message_matches="Temp file not found")


def test_update_book_add_duplicate_tempid(admin_client):
    """Один и тот же tempId дважды → 409."""
    temp_id = _upload_temp(admin_client, "minimal.epub")
    resp = admin_client.put("/api/books/1", json={"addFormats": [temp_id, temp_id]})
    assert_error(resp, 409)


def test_update_book_add_duplicate_format_via_two_tempids(admin_client):
    """Два разных tempId, оба резолвятся в один FMT → 409."""
    t1 = _upload_temp(admin_client, "minimal.epub")
    t2 = _upload_temp(admin_client, "minimal.epub")
    resp = admin_client.put("/api/books/1", json={"addFormats": [t1, t2]})
    assert_error(resp, 409)


def test_update_book_add_conflict_existing_format(admin_client):
    """FB2 уже в книге + addFormats: [tempId_fb2] без deleteFormats → 409 (early conflict check)."""
    temp_id = _upload_temp(admin_client, "minimal.fb2")
    resp = admin_client.put("/api/books/1", json={"addFormats": [temp_id]})
    assert_error(resp, 409)


def test_update_book_commit_cover_without_pending(admin_client):
    resp = admin_client.put("/api/books/1", json={"commitCover": True})
    assert_error(resp, 400, message_matches="No pending cover")


def test_update_book_max_length_exceeded(admin_client):
    resp = admin_client.put("/api/books/1", json={"addFormats": ["a"] * 11})
    assert resp.status_code == 422


def test_update_book_invalid_format_pattern_lowercase(admin_client):
    """Strict regex ^[A-Z0-9]{1,10}$ → lowercase → 422."""
    resp = admin_client.put("/api/books/1", json={"deleteFormats": ["epub"]})
    assert resp.status_code == 422


def test_update_book_invalid_tempid_pattern(admin_client):
    resp = admin_client.put("/api/books/1", json={"addFormats": ["contains-dash"]})
    assert resp.status_code == 422
