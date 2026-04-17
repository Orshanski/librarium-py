"""Metadata search endpoint error paths."""
from tests._helpers import assert_error


def test_metadata_search_requires_auth(anon_client):
    resp = anon_client.get("/api/metadata/search", params={"q": "test"})
    assert_error(resp, 401)
