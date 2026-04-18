import os
import shutil
import sys
from pathlib import Path

import pytest
from starlette.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BASELINE_DIR = PROJECT_ROOT / ".test-data-baseline"
TEST_DATA_DIR = PROJECT_ROOT / ".test-data"

# Выставить DATA_DIR ДО любого импорта app.*
os.environ["DATA_DIR"] = str(TEST_DATA_DIR)

# Добавить backend в path
sys.path.insert(0, str(PROJECT_ROOT / "backend"))


@pytest.fixture(scope="session", autouse=True)
def create_baseline():
    """Один раз за сессию: собрать baseline dataset."""
    from tests.seed import seed_baseline
    seed_baseline()
    yield
    if TEST_DATA_DIR.exists():
        shutil.rmtree(TEST_DATA_DIR)


@pytest.fixture(autouse=True)
def reset_test_data():
    """Перед каждым тестом: скопировать baseline → .test-data."""
    from app.database import reset_db
    reset_db()

    if TEST_DATA_DIR.exists():
        shutil.rmtree(TEST_DATA_DIR)
    shutil.copytree(BASELINE_DIR, TEST_DATA_DIR)

    yield

    reset_db()


@pytest.fixture
def db():
    """SQLite connection for direct DAL calls in tests."""
    from app.database import _get_db
    return _get_db()


@pytest.fixture
def client():
    """FastAPI TestClient."""
    from app.main import app
    client = TestClient(app)
    client.headers.update({"X-Requested-With": "XMLHttpRequest"})
    return client


@pytest.fixture
def admin_client(client):
    """Залогиниться как admin."""
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    assert "librarium_token" in resp.cookies
    return client


@pytest.fixture
def reader_client(client):
    """Залогиниться как reader."""
    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200
    assert "librarium_token" in resp.cookies
    return client


@pytest.fixture
def anon_client(client):
    """Explicit alias for `client` — signals 'anonymous, not logged in'."""
    return client


@pytest.fixture
def db_test():
    """Open a fresh SQLite connection to the test DB for direct inspection.

    Auto-closed after test. Use for reads; writes should go through the API.
    """
    from tests._helpers.db import connect_test_db
    conn = connect_test_db()
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def _clear_auth_rate_limit_state():
    """Clear auth rate-limit dict between tests to prevent 429 carry-over.

    Tests that exercise login failures (e.g. test_errors_auth.py,
    test_errors_500.py) leave entries in auth_service._login_attempts; without
    this fixture, later tests that happen to use the same test-client IP
    (typically 'testclient') can see unexpected 429s depending on test order.
    """
    from app.services import auth_service as _auth_service
    _auth_service._login_attempts.clear()
    yield
    _auth_service._login_attempts.clear()
