"""Test builders: DRY setup of users, shelves, books."""
from pathlib import Path

from starlette.testclient import TestClient


def _new_client() -> TestClient:
    """Fresh TestClient with CSRF header."""
    from app.main import app
    c = TestClient(app)
    c.headers.update({"X-Requested-With": "XMLHttpRequest"})
    return c


def login_client(*, username: str, password: str) -> TestClient:
    """
    Create a fresh TestClient and attempt to log in. Return the client
    regardless of login outcome.

    CONTRACT — DO NOT CHANGE TO FAIL-FAST:
    This helper MUST NOT raise or assert on login failure. If credentials are
    wrong, the returned client simply has no auth cookie — negative-path tests
    (wrong password, rate-limiting, etc.) explicitly depend on this behavior.

    Tests in tests/_helpers/test_builders.py fix this contract; changing it to
    fail-fast will break them and contradict the T-BE spec.
    """
    c = _new_client()
    c.post("/api/auth/login", json={"username": username, "password": password})
    return c


def make_user(admin_client, *, username: str, password: str = "p@ss",
              role: str = "reader", display_name: str | None = None,
              email: str | None = None) -> int:
    """POST /api/admin/users → id of created user."""
    body: dict = {"username": username, "password": password, "role": role}
    if display_name is not None:
        body["displayName"] = display_name
    if email is not None:
        body["email"] = email
    resp = admin_client.post("/api/admin/users", json=body)
    assert resp.status_code == 200, f"make_user failed: {resp.status_code} {resp.text}"
    return int(resp.json()["id"])


def make_shelf(client, *, name: str) -> int:
    """POST /api/shelves → shelf id."""
    resp = client.post("/api/shelves", json={"name": name})
    assert resp.status_code == 200, f"make_shelf failed: {resp.status_code} {resp.text}"
    return int(resp.json()["id"])


def make_book_via_upload(admin_client, file_path: str | Path,
                         metadata: dict | None = None) -> int:
    """Upload FB2/EPUB/PDF + POST /api/books/create → book id."""
    file_path = Path(file_path)
    with open(file_path, "rb") as f:
        up = admin_client.post(
            "/api/upload",
            files={"file": (file_path.name, f, "application/octet-stream")},
        )
    assert up.status_code == 200, f"upload failed: {up.status_code} {up.text}"
    temp_id = up.json()["tempId"]

    md = {"title": "Test Book", "authors": "Test Author"}
    if metadata:
        md.update(metadata)

    resp = admin_client.post("/api/books/create",
                             json={"tempId": temp_id, "metadata": md})
    assert resp.status_code == 200, (
        f"create book failed: {resp.status_code} {resp.text}"
    )
    return int(resp.json()["bookId"])
