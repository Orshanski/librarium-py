"""Rollback on failure: no ghost rows / orphaned files."""
import os
from pathlib import Path
from unittest.mock import patch

from starlette.testclient import TestClient

from tests._helpers import connect_test_db, count_rows

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_create_book_rollback_on_move_failure(admin_client):
    with open(FIXTURES / "minimal.fb2", "rb") as f:
        upload = admin_client.post(
            "/api/upload",
            files={"file": ("test.fb2", f, "application/octet-stream")},
        )
    temp_id = upload.json()["tempId"]

    # Dedicated client with raise_server_exceptions=False so 500 surfaces as a response
    from app.main import app
    no_raise = TestClient(app, raise_server_exceptions=False,
                          cookies=admin_client.cookies)
    no_raise.headers.update({"X-Requested-With": "XMLHttpRequest"})

    with patch("app.fs_utils.shutil.move",
               side_effect=OSError("disk full")):
        resp = no_raise.post("/api/books/create", json={
            "tempId": temp_id,
            "metadata": {"title": "Should Fail", "authors": "Nobody"},
        })
    assert resp.status_code == 500

    # DB: no ghost row
    db = connect_test_db()
    try:
        assert count_rows(db, "books", "title = ?", ("Should Fail",)) == 0
    finally:
        db.close()

    # FS: no empty orphan dirs in library/
    library = Path(os.environ["DATA_DIR"]) / "library"
    for d in library.iterdir():
        if d.is_dir():
            assert any(d.iterdir()), f"Orphan empty dir: {d}"
