"""Integration tests для расширенного PUT /api/books/{id} (apply-edit flow).

См. spec 2026-04-24-book-format-staging-design.md §7.
"""
# Staged imports для Tasks 3-9: `logging`/`shutil`/`patch` — rollback-тесты,
# `TestClient` — custom no_raise клиент, `assert_error`/`connect_test_db` —
# error-path и DB-ассерты. Plan 2026-04-24-book-format-staging.md.
import glob
import logging  # noqa: F401  # used in Task 5 caplog tests
import os  # noqa: F401  # used in Task 4+ FS assertions
import shutil
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from tests._helpers import assert_error, assert_ok, connect_test_db, login_client

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
    data = assert_ok(resp)
    assert data["ok"] is True
    assert data["book"]["id"] == 1
    assert data["book"]["title"]
    assert data["files"]
    assert "identifiers" in data


def test_update_book_metadata_returns_fresh_detail(admin_client):
    """PUT metadata returns the updated book detail, not only {ok: true}."""
    resp = admin_client.put("/api/books/1", json={"title": "Fresh Detail Title"})
    data = assert_ok(resp)
    assert data["ok"] is True
    assert data["book"]["id"] == 1
    assert data["book"]["title"] == "Fresh Detail Title"
    assert data["files"]
    assert "identifiers" in data


def test_update_book_response_uses_authenticated_user_scope(admin_client):
    """PUT response detail must include per-user fields for the admin making the request."""
    assert_ok(admin_client.put("/api/admin/users/2", json={"role": "admin"}))
    reader_admin = login_client(username="reader", password="reader123")

    resp = reader_admin.put("/api/books/1", json={"title": "Reader Admin Detail"})
    data = assert_ok(resp)

    assert data["book"]["id"] == 1
    assert data["book"]["title"] == "Reader Admin Detail"
    assert data["book"]["rating"] == 5
    assert data["book"]["isRead"] == 1


def test_update_book_add_formats_happy(admin_client):
    """PUT с addFormats: [tempId] → файл в library, book_files обновлён, tempId удалён."""
    test_data = os.environ["DATA_DIR"]
    temp_id = _upload_temp(admin_client, "minimal.epub")

    assert os.path.exists(os.path.join(test_data, "uploads", f"{temp_id}.epub"))

    resp = admin_client.put("/api/books/1", json={"addFormats": [temp_id]})
    data = assert_ok(resp)
    assert data["ok"] is True
    assert any(f["format"] == "EPUB" for f in data["files"])

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
    data = assert_ok(resp)
    assert data["ok"] is True
    assert all(f["format"] != "FB2" for f in data["files"])

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


def test_update_book_commit_cover_happy(admin_client, db):
    """commitCover: true применяет pending cover, temp-cover удалён."""
    test_data = os.environ["DATA_DIR"]
    before = assert_ok(admin_client.get("/api/books/2"))["book"]
    # Wire `coverPath` is the API URL `/api/covers/{id}?t=<updated_at>` —
    # raw DB column lives in `books.cover_path` and is checked separately.
    db_cover_before = db.execute("SELECT cover_path FROM books WHERE id=2").fetchone()[0]
    assert db_cover_before.endswith("/cover.jpg")

    with open(FIXTURES / "../test_cover.png", "rb") as f:
        upload = admin_client.post(
            "/api/books/2/cover",
            files={"file": ("new.png", f, "image/png")},
        )
    assert_ok(upload)

    resp = admin_client.put("/api/books/2", json={"commitCover": True})
    data = assert_ok(resp)
    assert data["ok"] is True
    db_cover_after = db.execute("SELECT cover_path FROM books WHERE id=2").fetchone()[0]
    assert db_cover_after.endswith("/cover.png")
    assert data["book"]["coverPath"] != before["coverPath"]

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
    # Precondition: book 1 должен иметь FB2 по seed, чтобы replace-семантика
    # (delete ∩ add одного формата) реально тестировалась, а не сводилась к add.
    assert os.path.isfile(os.path.join(test_data, "library", "1", "book.fb2"))
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
#
# Domain-level errors (400/404/409) — через assert_error, т.к. body содержит
# {"detail": str} с человеческим сообщением.
# Pydantic-level errors (422) — через прямой `resp.status_code == 422`,
# т.к. body содержит `{"detail": [{"type": ..., "loc": ...}]}` и
# `message_matches` на нём бесполезен.
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


# ---------------------------------------------------------------------------
# Task 9: Error-path (rollback) tests
# ---------------------------------------------------------------------------


def test_update_book_copyfile_fail_rollback(admin_client):
    """Два pending-add; mock shutil.copyfile падает на втором → первый dst откачен."""
    test_data = os.environ["DATA_DIR"]

    t1 = _upload_temp(admin_client, "minimal.epub")
    t2 = _upload_temp(admin_client, "minimal.fb2")

    # Сперва удалить FB2 у book 1 через apply, чтобы оба add'а могли сосуществовать.
    assert_ok(admin_client.put("/api/books/1", json={"deleteFormats": ["FB2"]}))
    assert not os.path.isfile(os.path.join(test_data, "library", "1", "book.fb2"))

    from app.main import app
    no_raise = TestClient(app, raise_server_exceptions=False, cookies=admin_client.cookies)
    no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})

    call_count = {"n": 0}
    original_copyfile = shutil.copyfile

    def flaky_copyfile(src, dst, *a, **kw):
        call_count["n"] += 1
        if call_count["n"] >= 2:
            raise OSError("disk full")
        return original_copyfile(src, dst, *a, **kw)

    with patch("app.services.book_service.shutil.copyfile", side_effect=flaky_copyfile):
        resp = no_raise.put("/api/books/1", json={"addFormats": [t1, t2]})
    assert_error(resp, 500)

    # Первый dst (EPUB) тоже удалён (откатывается через copied_dsts cleanup)
    assert not os.path.isfile(os.path.join(test_data, "library", "1", "book.epub"))
    assert not os.path.isfile(os.path.join(test_data, "library", "1", "book.fb2"))

    # Оба temp-файла в буфере сохранены для повтора
    assert os.path.exists(os.path.join(test_data, "uploads", f"{t1}.epub"))
    assert os.path.exists(os.path.join(test_data, "uploads", f"{t2}.fb2"))


def test_update_book_dal_add_fail_rollback(admin_client):
    """Mock dal.add_book_file внутри register_and_linearize → copied_dsts откатились."""
    test_data = os.environ["DATA_DIR"]
    temp_id = _upload_temp(admin_client, "minimal.epub")

    from app.main import app
    no_raise = TestClient(app, raise_server_exceptions=False, cookies=admin_client.cookies)
    no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})

    with patch(
        "app.services.book_file_writer.dal.add_book_file",
        side_effect=RuntimeError("simulated dal failure"),
    ):
        resp = no_raise.put("/api/books/1", json={"addFormats": [temp_id]})
    assert_error(resp, 500)

    assert not os.path.isfile(os.path.join(test_data, "library", "1", "book.epub"))
    assert os.path.exists(os.path.join(test_data, "uploads", f"{temp_id}.epub"))


def test_update_book_dal_update_fail_in_metadata_stage(admin_client):
    """Mock dal.update_book → FS уже применён (файлы), DAL metadata откачена.

    Документирует trade-off spec §8: частичное состояние recoverable через повтор Save.
    """
    test_data = os.environ["DATA_DIR"]
    temp_id = _upload_temp(admin_client, "minimal.epub")

    # Snapshot title до запроса — для точного ассерта, что metadata откачена.
    db = connect_test_db()
    try:
        original_title = db.execute("SELECT title FROM books WHERE id=1").fetchone()[0]
    finally:
        db.close()

    from app.main import app
    no_raise = TestClient(app, raise_server_exceptions=False, cookies=admin_client.cookies)
    no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})

    with patch(
        "app.services.book_service.dal.update_book",
        side_effect=RuntimeError("simulated metadata fail"),
    ):
        resp = no_raise.put(
            "/api/books/1",
            json={"addFormats": [temp_id], "title": "should not apply"},
        )
    assert_error(resp, 500)

    # FS-часть уже применена — файл остался на диске (spec §8 trade-off).
    assert os.path.isfile(os.path.join(test_data, "library", "1", "book.epub"))

    # metadata откачена через db_session rollback.
    db = connect_test_db()
    try:
        title = db.execute("SELECT title FROM books WHERE id=1").fetchone()[0]
    finally:
        db.close()
    assert title == original_title


def test_update_book_cover_commit_rollback(admin_client):
    """Mock update_cover_path → backup восстанавливается через _restore_from_backup."""
    test_data = os.environ["DATA_DIR"]
    book_dir = os.path.join(test_data, "library", "2")
    old_cover = next(
        f for f in os.listdir(book_dir)
        if f.startswith("cover.") and "bak" not in f
    )
    with open(os.path.join(book_dir, old_cover), "rb") as f:
        old_content = f.read()

    with open(FIXTURES / "../test_cover.png", "rb") as f:
        admin_client.post("/api/books/2/cover", files={"file": ("new.png", f, "image/png")})

    from app.main import app
    no_raise = TestClient(app, raise_server_exceptions=False, cookies=admin_client.cookies)
    no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})

    with patch(
        "app.services.cover_service.update_cover_path",
        side_effect=RuntimeError("simulated db failure"),
    ):
        resp = no_raise.put("/api/books/2", json={"commitCover": True})
    assert_error(resp, 500)

    with open(os.path.join(book_dir, old_cover), "rb") as f:
        assert f.read() == old_content
    assert not os.path.exists(os.path.join(book_dir, "cover.jpg.bak"))


# ---------------------------------------------------------------------------
# Task 10: Legacy endpoint removal tests (TDD — fail before Task 11)
# ---------------------------------------------------------------------------


def test_old_files_endpoints_removed(admin_client):
    """POST/DELETE /api/books/:id/files → 404/405."""
    resp = admin_client.post(
        "/api/books/1/files",
        files={"file": ("x.epub", b"\x00", "application/octet-stream")},
    )
    assert resp.status_code in (404, 405)

    resp = admin_client.delete("/api/books/1/files", params={"format": "FB2"})
    assert resp.status_code in (404, 405)


def test_old_cover_commit_endpoint_removed(admin_client):
    """PUT /api/books/:id/cover → 404/405."""
    resp = admin_client.put("/api/books/1/cover")
    assert resp.status_code in (404, 405)


# ---------------------------------------------------------------------------
# Bug 1 regression: replace-flow rollback restores original file from .bak
# ---------------------------------------------------------------------------


def test_update_book_replace_format_add_fail_restores_original(admin_client):
    """Bug 1 regression: replace = delete + add same fmt; если add падает,
    оригинальный файл должен быть восстановлен из .bak (не потерян)."""
    test_data = os.environ["DATA_DIR"]
    original_fb2_path = os.path.join(test_data, "library", "1", "book.fb2")
    assert os.path.isfile(original_fb2_path), "baseline: book 1 должна иметь FB2"
    with open(original_fb2_path, "rb") as f:
        original_content = f.read()

    temp_id = _upload_temp(admin_client, "minimal.fb2")

    from app.main import app
    no_raise = TestClient(app, raise_server_exceptions=False, cookies=admin_client.cookies)
    no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})

    # Mock copyfile → падение на add-этапе. delete-этап (renames в .bak) уже завершится.
    with patch(
        "app.services.book_service.shutil.copyfile",
        side_effect=OSError("disk full"),
    ):
        resp = no_raise.put(
            "/api/books/1",
            json={"deleteFormats": ["FB2"], "addFormats": [temp_id]},
        )
    assert_error(resp, 500)

    # Bug fix: оригинальный файл должен быть восстановлен.
    assert os.path.isfile(original_fb2_path), \
        "Оригинальный FB2 должен быть восстановлен из .bak после сбоя add"
    with open(original_fb2_path, "rb") as f:
        assert f.read() == original_content, "Содержимое должно быть исходным"

    # .bak не должен остаться на диске.
    assert not os.path.exists(original_fb2_path + ".bak"), \
        ".bak должен быть переименован обратно в исходный файл"

    # DB: FB2 row должен существовать (DAL rollback восстановил).
    db = connect_test_db()
    try:
        formats = [r[0] for r in db.execute(
            "SELECT format FROM book_files WHERE book_id = 1"
        ).fetchall()]
    finally:
        db.close()
    assert "FB2" in formats, "DAL rollback должен восстановить FB2 row"

    # temp файл сохранён для повтора.
    assert os.path.exists(os.path.join(test_data, "uploads", f"{temp_id}.fb2"))
