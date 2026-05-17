"""Reader endpoints error paths (401) + nonexistent-book behavior."""
from tests._helpers import assert_error, assert_ok


def test_settings_require_auth(anon_client):
    assert_error(anon_client.get("/api/reader/settings"), 401)


def test_progress_require_auth_get(anon_client):
    assert_error(anon_client.get("/api/reader/progress/1"), 401)


def test_progress_require_auth_put(anon_client):
    resp = anon_client.put("/api/reader/progress/1",
                           json={"position": "ch1", "lastDevice": "x"})
    assert_error(resp, 401)


def test_progress_nonexistent_book_returns_defaults(reader_client):
    """Fixed behavior: GET /api/reader/progress/{missing_id} returns 200 with
    default state (position/fraction/lastReadAt are None, version == 0).
    The endpoint does NOT 404 on a missing book — it returns a starting-point
    progress record so the client can begin reading.
    """
    data = assert_ok(reader_client.get("/api/reader/progress/999999"))
    assert data["position"] is None
    assert data["lastDevice"] is None
    assert data["lastFormat"] is None
    assert data["fraction"] is None
    assert data["lastReadAt"] is None
    assert data["version"] == 0


def test_progress_put_nonexistent_book_returns_404(reader_client):
    """PUT /api/reader/progress/{missing_id} должен вернуть 404, а не 500.

    Сценарий: PWA пушит stale progress из IDB по book_id'у удалённой книги.
    Без проверки FK (reading_progress.book_id REFERENCES books) падает с
    IntegrityError → 500. Должно быть аккуратное 404, чтобы клиент мог
    вычистить хвост из локальной очереди.
    """
    resp = reader_client.put(
        "/api/reader/progress/999999",
        json={"position": "ch1", "lastDevice": "x", "fraction": 0.1},
    )
    assert_error(resp, 404)
