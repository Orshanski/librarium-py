"""Integration tests для расширенного PUT /api/books/{id} (apply-edit flow).

См. spec 2026-04-24-book-format-staging-design.md §7.
"""
# Staged imports для Tasks 3-9: `logging`/`shutil`/`patch` — rollback-тесты,
# `TestClient` — custom no_raise клиент, `assert_error`/`connect_test_db` —
# error-path и DB-ассерты. Plan 2026-04-24-book-format-staging.md.
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
