"""Smoke-test new fixtures from conftest."""


def test_anon_client_is_unauthenticated(anon_client):
    resp = anon_client.get("/api/auth/me")
    assert resp.status_code == 401


def test_db_test_returns_connection(db_test):
    row = db_test.execute("SELECT COUNT(*) as c FROM users").fetchone()
    assert row["c"] == 2
