"""Series router error paths (401/403/404/400)."""
from tests._helpers import assert_error


def test_get_series_unauthenticated_is_401(anon_client):
    assert_error(anon_client.get("/api/series/1"), 401)


def test_reader_cannot_rename_series(reader_client):
    assert_error(reader_client.put("/api/series/1", json={"name": "X"}), 403)


def test_reader_cannot_merge_series(reader_client):
    assert_error(
        reader_client.post("/api/series/1/merge",
                           json={"sourceId": 2}),
        403,
    )


def test_rename_nonexistent_series_is_404(admin_client):
    assert_error(
        admin_client.put("/api/series/999999", json={"name": "X"}),
        404,
    )


def test_get_nonexistent_series_is_404(reader_client):
    assert_error(reader_client.get("/api/series/999999"),
                 404)


def test_self_merge_is_400(admin_client):
    assert_error(
        admin_client.post("/api/series/1/merge",
                          json={"sourceId": 1}),
        400,
    )
