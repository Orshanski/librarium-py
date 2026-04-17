"""Authors router error paths (401/403/404/400)."""
from tests._helpers import assert_error


def test_get_author_unauthenticated_is_401(anon_client):
    assert_error(anon_client.get("/api/authors/1"), 401)


def test_reader_cannot_rename_author(reader_client):
    assert_error(reader_client.put("/api/authors/1", json={"name": "X"}), 403)


def test_reader_cannot_merge_authors(reader_client):
    assert_error(
        reader_client.post("/api/authors/1/merge",
                           json={"sourceId": 3}),
        403,
    )


def test_rename_nonexistent_author_is_404(admin_client):
    assert_error(
        admin_client.put("/api/authors/999999", json={"name": "X"}),
        404,
    )


def test_get_nonexistent_author_is_404(reader_client):
    assert_error(reader_client.get("/api/authors/999999"),
                 404)


def test_self_merge_is_400(admin_client):
    assert_error(
        admin_client.post("/api/authors/1/merge",
                          json={"sourceId": 1}),
        400,
    )
