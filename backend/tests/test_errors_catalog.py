"""Catalog listing + filter validation error paths."""
from tests._helpers import assert_error


def test_list_books_unauthenticated_is_401(anon_client):
    assert_error(anon_client.get("/api/books"), 401)


def test_filter_by_garbage_author_id(reader_client):
    """Non-int authorIds — current parse_ids behavior: silently ignored,
    returns all books. Fix this behavior as-is."""
    resp = reader_client.get("/api/books", params={"authorIds": "abc"})
    assert resp.status_code == 200
    assert len(resp.json()["books"]) == 5
