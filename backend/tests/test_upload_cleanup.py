"""Temp cleanup via DELETE /api/uploads/{temp_id}."""
import os
from pathlib import Path

from tests._helpers import assert_ok

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def _uploads_dir():
    return Path(os.environ["DATA_DIR"]) / "uploads"


def test_upload_parse_failure_cleans_temp_artifacts(monkeypatch):
    """При падении parse_book _cleanup_temp_artifacts должен удалить temp book file."""
    from app.main import app
    from app.services import auth_service as _auth_service
    from app.services import upload_service
    from starlette.testclient import TestClient

    def boom(book_path, ext):
        raise RuntimeError("simulated parse failure")

    monkeypatch.setattr(upload_service, "parse_book", boom)

    no_raise = TestClient(app, raise_server_exceptions=False)
    no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})
    _auth_service._login_attempts.clear()
    login = no_raise.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login.status_code == 200

    before = len(list(_uploads_dir().iterdir()))

    with open(FIXTURES / "minimal.fb2", "rb") as f:
        resp = no_raise.post(
            "/api/upload",
            files={"file": ("x.fb2", f.read(), "application/xml")},
        )
    assert resp.status_code == 500

    after = len(list(_uploads_dir().iterdir()))
    assert after == before


def test_cleanup_removes_temp_files(admin_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        upload = admin_client.post(
            "/api/upload",
            files={"file": ("test.fb2", f, "application/octet-stream")},
        )
    temp_id = upload.json()["tempId"]

    assert any(f.name.startswith(temp_id) for f in _uploads_dir().iterdir())

    assert_ok(admin_client.delete(f"/api/uploads/{temp_id}"))

    remaining = [f for f in _uploads_dir().iterdir() if f.name.startswith(temp_id)]
    assert remaining == []


def test_cleanup_idempotent(admin_client):
    resp = admin_client.delete("/api/uploads/nonexist1")
    assert_ok(resp)


def test_cleanup_does_not_affect_other_upload(admin_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        up_a = admin_client.post(
            "/api/upload",
            files={"file": ("a.fb2", f, "application/octet-stream")},
        )
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        up_b = admin_client.post(
            "/api/upload",
            files={"file": ("b.fb2", f, "application/octet-stream")},
        )

    tid_a = up_a.json()["tempId"]
    tid_b = up_b.json()["tempId"]

    assert_ok(admin_client.delete(f"/api/uploads/{tid_a}"))

    a = [f for f in _uploads_dir().iterdir()
         if f.name.startswith(tid_a + ".") or f.name.startswith(tid_a + "-cover.")]
    b = [f for f in _uploads_dir().iterdir()
         if f.name.startswith(tid_b + ".") or f.name.startswith(tid_b + "-cover.")]
    assert a == [], f"Cleanup should remove all files for {tid_a}"
    assert len(b) >= 1, f"Files for {tid_b} should persist"
