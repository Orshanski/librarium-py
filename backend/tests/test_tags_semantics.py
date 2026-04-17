"""Tags read + semantics (no CREATE/UPDATE/DELETE endpoints for tags)."""
from tests._helpers import assert_ok, fetch_one


def test_tags_directory_has_ids_and_names(reader_client):
    data = assert_ok(reader_client.get("/api/filter-options/tags"))
    assert len(data["tags"]) > 0
    for tag in data["tags"]:
        assert "id" in tag and "name" in tag


def test_tag_cloud_has_book_counts(reader_client):
    data = assert_ok(reader_client.get("/api/tags/cloud"))
    assert len(data["tags"]) > 0
    for t in data["tags"]:
        assert "book_count" in t
        assert t["book_count"] >= 1


def test_filter_books_by_tag(reader_client):
    data = assert_ok(reader_client.get("/api/books", params={"tagIds": "1"}))
    ids = {b["id"] for b in data["books"]}
    assert ids == {1, 3, 5}


def test_tag_created_as_side_effect_of_book_update(admin_client, db_test):
    """PUT /books/{id} with a new tag name should create a tags row."""
    before = fetch_one(db_test, "SELECT id FROM tags WHERE name = ?", ("FreshTag",))
    assert before is None

    resp = admin_client.put("/api/books/1", json={"tagIds": ["FreshTag"]})
    assert_ok(resp)

    after = fetch_one(db_test, "SELECT id FROM tags WHERE name = ?", ("FreshTag",))
    assert after is not None
