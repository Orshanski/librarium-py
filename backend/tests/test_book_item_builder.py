"""Unit tests for services.book_item_builder."""
from app.dtos._refs import AuthorRef, SeriesRef
from app.dtos.book_card import BookCardItem
from app.services.book_item_builder import row_to_book_card_item


class TestRowToBookCardItem:
    """Builder: row_to_book_card_item — converts DAL row into BookCardItem."""

    def test_minimal_row(self):
        row = {
            "id": 1,
            "title": "T",
            "authors": [AuthorRef(id=10, name="A")],
            "series": None,
            "series_number": None,
            "updated_at": "2020-01-01 00:00:00",
            "rating": None,
            "is_read": 0,
        }
        item = row_to_book_card_item(row)
        assert isinstance(item, BookCardItem)
        assert item.id == 1
        assert item.title == "T"
        assert item.authors == [AuthorRef(id=10, name="A")]
        assert item.series is None
        assert item.rating is None
        assert item.is_read is False
        assert item.cover_path == "/api/covers/1?t=2020-01-01 00:00:00"

    def test_with_series_and_rating(self):
        row = {
            "id": 2,
            "title": "T2",
            "authors": [AuthorRef(id=10, name="A")],
            "series": SeriesRef(id=5, name="S"),
            "series_number": 2.5,
            "updated_at": "2020-01-01",
            "rating": 4,
            "is_read": 1,
        }
        item = row_to_book_card_item(row)
        assert item.series == SeriesRef(id=5, name="S")
        assert item.series_number == 2.5
        assert item.rating == 4
        assert item.is_read is True

    def test_is_read_coerces_int_to_bool(self):
        row = {
            "id": 3, "title": "T", "authors": [], "series": None,
            "series_number": None, "updated_at": "2020", "rating": None,
            "is_read": 1,
        }
        item = row_to_book_card_item(row)
        assert item.is_read is True

    def test_is_read_none_becomes_false(self):
        row = {
            "id": 3, "title": "T", "authors": [], "series": None,
            "series_number": None, "updated_at": "2020", "rating": None,
            "is_read": None,
        }
        item = row_to_book_card_item(row)
        assert item.is_read is False
