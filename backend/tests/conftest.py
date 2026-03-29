import os
import shutil
import sys
from pathlib import Path

import pytest

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
def client():
    """FastAPI TestClient."""
    from starlette.testclient import TestClient
    from app.main import app
    return TestClient(app)


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
