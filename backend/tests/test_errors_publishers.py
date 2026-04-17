"""Publishers endpoint error paths."""
from tests._helpers import assert_error


def test_publishers_unauthenticated_is_401(anon_client):
    resp = anon_client.get("/api/publishers")
    assert_error(resp, 401)
