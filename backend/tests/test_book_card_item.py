"""Tests for BookCardItem — unified DTO for book-in-list across all endpoints."""
from app.dtos.book_card import BookCardItem
from app.dtos._refs import AuthorRef, SeriesRef


class TestBookCardItemShape:
    def test_required_fields_present(self):
        item = BookCardItem(
            id=1,
            title="Test",
            authors=[AuthorRef(id=10, name="Author")],
            series=None,
            series_number=None,
            cover_path="/api/covers/1?t=2026",
            rating=None,
            is_read=False,
        )
        assert item.id == 1
        assert item.title == "Test"
        assert item.authors == [AuthorRef(id=10, name="Author")]
        assert item.series is None
        assert item.series_number is None
        assert item.rating is None
        assert item.is_read is False

    def test_series_as_nested_object(self):
        item = BookCardItem(
            id=1,
            title="Test",
            authors=[],
            series=SeriesRef(id=5, name="Cycle"),
            series_number=2.5,
            cover_path="/api/covers/1",
            rating=4,
            is_read=True,
        )
        assert item.series == SeriesRef(id=5, name="Cycle")
        assert item.series_number == 2.5
        assert item.rating == 4
        assert item.is_read is True

    def test_camel_case_wire(self):
        """Pydantic serialises with camelCase aliases via RESPONSE_CONFIG."""
        item = BookCardItem(
            id=1, title="T", authors=[], series=None,
            series_number=1.0, cover_path="/c", rating=None, is_read=False,
        )
        data = item.model_dump(by_alias=True)
        assert "seriesNumber" in data
        assert "coverPath" in data
        assert "isRead" in data
        assert "series_number" not in data

    def test_accepts_snake_keys_from_dal_rows(self):
        """populate_by_name=True allows snake-keyed dict from DAL TypedDicts."""
        item = BookCardItem.model_validate({
            "id": 1, "title": "T",
            "authors": [{"id": 10, "name": "A"}],
            "series": {"id": 5, "name": "S"},
            "series_number": 1.0,
            "cover_path": "/c",
            "rating": 3,
            "is_read": False,
        })
        assert item.series == SeriesRef(id=5, name="S")
        assert item.rating == 3


class TestBookDetailItemShape:
    def test_extends_book_card_item(self):
        """BookDetailItem inherits all fields from BookCardItem and adds detail fields."""
        from app.dtos.book_card import BookDetailItem
        from app.dtos._refs import TagRef
        item = BookDetailItem(
            id=1,
            title="T",
            authors=[],
            series=None,
            series_number=None,
            cover_path="/c",
            rating=None,
            is_read=False,
            sort_title="T",
            description="desc",
            language="ru",
            publisher="Pub",
            pub_date="2020-01-01",
            tags=[TagRef(id=7, name="fantasy"), TagRef(id=8, name="ru")],
            added_at="2020-01-01 00:00:00",
            updated_at="2020-01-01 00:00:00",
        )
        # card fields
        assert item.id == 1
        assert item.is_read is False
        # detail fields
        assert item.description == "desc"
        assert item.publisher == "Pub"
        # tags must validate as list[TagRef]
        assert item.tags == [TagRef(id=7, name="fantasy"), TagRef(id=8, name="ru")]
        assert all(isinstance(t, TagRef) for t in item.tags)

    def test_book_detail_is_subclass(self):
        from app.dtos.book_card import BookCardItem, BookDetailItem
        assert issubclass(BookDetailItem, BookCardItem)
