import os
import shutil
import sys
import tempfile
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
    """Перед каждым тестом: atomic swap .test-data на свежую копию baseline.

    Схема: (1) копия baseline в tempdir-sibling `.test-data-new-*`, (2) атомарный
    rename старого `.test-data` → `.test-data-old-*`, (3) атомарный rename нового
    → `.test-data`, (4) lazy cleanup старого.

    Почему atomic swap, а не rmtree+copytree с ignore_errors: последний молча
    оставляет leftover-файлы (temp-covers, thumbs, uploads), не представленные
    в baseline — они переживают setup и создают order-dependent тесты. Atomic
    rename гарантирует, что `.test-data` после setup'а идентичен baseline
    бит-в-бит, без прошлых артефактов. Rename на одном volume атомарен даже на
    APFS и не нарывается на busy-handle в целевом dir.

    Guard на пропавший BASELINE_DIR — пересоздаём через seed_baseline, если
    state drift (segfault / teardown error в tearDown) снёс baseline.
    """
    from app.database import reset_db
    reset_db()

    if not BASELINE_DIR.exists():
        from tests.seed import seed_baseline
        seed_baseline()

    # 0. Best-effort cleanup хвостов от аварийно завершённых прошлых прогонов.
    # Уникальные имена через mkdtemp означают, что коллизий с именами не будет,
    # но хвосты накапливались бы без уборки.
    for leftover in PROJECT_ROOT.glob(".test-data-old-*"):
        shutil.rmtree(leftover, ignore_errors=True)
    for leftover in PROJECT_ROOT.glob(".test-data-new-*"):
        shutil.rmtree(leftover, ignore_errors=True)

    # 1. Готовим новую копию baseline в sibling-tempdir (на том же volume).
    new_dir = Path(tempfile.mkdtemp(prefix=".test-data-new-", dir=PROJECT_ROOT))
    # mkdtemp создал пустой dir; shutil.copytree требует чтобы dst НЕ существовал.
    new_dir.rmdir()
    shutil.copytree(BASELINE_DIR, new_dir)

    # 2. Если старый TEST_DATA_DIR существует — rename его в old-sibling.
    # Rename без try/except: если не удалось — fixture падает, и это корректно,
    # потому что продолжать с грязным/заблокированным `.test-data` нельзя.
    old_dir = None
    if TEST_DATA_DIR.exists():
        old_dir = Path(tempfile.mkdtemp(prefix=".test-data-old-", dir=PROJECT_ROOT))
        old_dir.rmdir()
        TEST_DATA_DIR.rename(old_dir)  # атомарный rename на одном volume

    # 3. Атомарный rename нового под правильное имя.
    new_dir.rename(TEST_DATA_DIR)

    yield

    reset_db()

    # 4. Best-effort cleanup старого дерева после теста. Не блокирует никого:
    # setup следующего теста всё равно подчистит хвосты в шаге 0.
    if old_dir is not None:
        shutil.rmtree(old_dir, ignore_errors=True)


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


@pytest.fixture
def regular_shelf_id(db, reader_client):
    """User-created shelf with 2+ books for sort-ordering checks.

    Creates the shelf via DAL for user 2 (reader) and adds books 1 and 2
    from the baseline fixture. The reader_client dependency ensures the
    test-data dir is initialised before the DAL fixture runs.
    """
    from app.dal import shelves as shelves_dal
    shelf_id = shelves_dal.create_shelf(db, user_id=2, name="test-shelf-jmdc")
    shelves_dal.add_book_to_shelf(db, shelf_id, 1)
    shelves_dal.add_book_to_shelf(db, shelf_id, 2)
    db.commit()
    return shelf_id


@pytest.fixture
def reading_now_shelf_id(db, reader_client):
    """ID of the system reading_now shelf for user 2 (reader).

    System shelves are auto-created at seed time via create_user; this
    fixture just looks them up. The reader_client dependency ensures
    baseline data is in place.
    """
    from app.dal import shelves as shelves_dal
    shelves = shelves_dal.get_shelves(db, user_id=2)
    for s in shelves:
        if s["system_code"] == "reading_now":
            return s["id"]
    raise RuntimeError("reading_now shelf not found for user 2")


@pytest.fixture
def tag_id(db):
    """First tag id that has at least one book (from baseline fixture)."""
    row = db.execute("SELECT bt.tag_id FROM book_tags bt GROUP BY bt.tag_id LIMIT 1").fetchone()
    return row["tag_id"]


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
