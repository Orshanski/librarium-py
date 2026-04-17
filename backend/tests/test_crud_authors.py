"""Indirect CRUD coverage for authors (no standalone create/delete endpoints)."""
from pathlib import Path

from tests._helpers import (
    assert_ok, make_book_via_upload,
    count_rows, fetch_one,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_author_created_via_book_upload(admin_client, db_test):
    """Uploading a book with a new author creates the author row."""
    make_book_via_upload(
        admin_client, FIXTURES / "minimal.fb2",
        metadata={"title": "Author CRUD Book", "authors": "Brand New Author"},
    )
    after = count_rows(db_test, "authors", "name = ?", ("Brand New Author",))
    assert after == 1


def test_author_read(reader_client):
    data = assert_ok(reader_client.get("/api/authors/1"))
    assert data["author"]["name"] == "Test Author"


def test_author_rename(admin_client, db_test):
    resp = admin_client.put("/api/authors/1", json={"name": "Renamed Author"})
    assert_ok(resp)
    row = fetch_one(db_test, "SELECT name FROM authors WHERE id = ?", (1,))
    assert row["name"] == "Renamed Author"


def test_author_delete_via_merge(admin_client, db_test):
    """Author 3 → merge into 1 → author 3 deleted."""
    resp = admin_client.post("/api/authors/1/merge",
                             json={"sourceId": 3})
    assert_ok(resp)
    assert fetch_one(db_test, "SELECT id FROM authors WHERE id = ?", (3,)) is None
