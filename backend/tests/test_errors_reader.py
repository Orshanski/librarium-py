"""Reader endpoints error paths (401) + nonexistent-book behavior."""
from tests._helpers import assert_error, assert_ok


def test_settings_require_auth(anon_client):
    assert_error(anon_client.get("/api/reader/settings"), 401)


def test_progress_require_auth_get(anon_client):
    assert_error(anon_client.get("/api/reader/progress/1"), 401)


def test_progress_require_auth_put(anon_client):
    resp = anon_client.put("/api/reader/progress/1",
                           json={"position": "ch1", "last_device": "x"})
    assert_error(resp, 401)


def test_progress_nonexistent_book_returns_defaults(reader_client):
    """Fixed behavior: GET /api/reader/progress/{missing_id} returns 200 with
    default state (position/fraction/last_read_at are None, version == 0).
    The endpoint does NOT 404 on a missing book — it returns a starting-point
    progress record so the client can begin reading.
    """
    data = assert_ok(reader_client.get("/api/reader/progress/999999"))
    assert data["position"] is None
    assert data["last_device"] is None
    assert data["last_format"] is None
    assert data["fraction"] is None
    assert data["last_read_at"] is None
    assert data["version"] == 0
