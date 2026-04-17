"""Indirect CRUD coverage for series (no standalone create/delete endpoints)."""
from pathlib import Path

from tests._helpers import (
    assert_ok, make_book_via_upload,
    count_rows, fetch_one,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_series_created_via_book_upload(admin_client, db_test):
    make_book_via_upload(
        admin_client, FIXTURES / "minimal.fb2",
        metadata={
            "title": "Series CRUD Book",
            "authors": "Some Author",
            "series": "Fresh Series",
            "seriesNumber": "1",
        },
    )
    after = count_rows(db_test, "series", "name = ?", ("Fresh Series",))
    assert after == 1


def test_series_read(reader_client):
    data = assert_ok(reader_client.get("/api/series/1"))
    assert data["series"]["name"] == "Test Series"


def test_series_rename(admin_client, db_test):
    resp = admin_client.put("/api/series/1", json={"name": "Renamed Series"})
    assert_ok(resp)
    row = fetch_one(db_test, "SELECT name FROM series WHERE id = ?", (1,))
    assert row["name"] == "Renamed Series"


def test_series_delete_via_merge(admin_client, db_test):
    """Series 2 → merge into 1 → series 2 deleted."""
    resp = admin_client.post("/api/series/1/merge",
                             json={"sourceId": 2})
    assert_ok(resp)
    assert fetch_one(db_test, "SELECT id FROM series WHERE id = ?", (2,)) is None
