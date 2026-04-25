"""Unit-тесты для services.book_item_builder.row_to_book_item."""
from app.dtos._refs import AuthorRef, SeriesRef, TagRef
from app.services.book_item_builder import row_to_book_item


def test_row_to_book_item_passes_refs_through():
    row = {
        "id": 1,
        "title": "T",
        "added_at": "2026-01-01",
        "updated_at": "2026-01-02",
        "authors": [AuthorRef(id=1, name="A"), AuthorRef(id=2, name="B")],
        "tags": [TagRef(id=10, name="tag")],
        "series": SeriesRef(id=5, name="ВК"),
    }
    item = row_to_book_item(row)
    assert item.authors == [AuthorRef(id=1, name="A"), AuthorRef(id=2, name="B")]
    assert item.tags == [TagRef(id=10, name="tag")]
    assert item.series == SeriesRef(id=5, name="ВК")
    assert not hasattr(item, "authorIds")
    assert not hasattr(item, "tagIds")
    assert not hasattr(item, "seriesId")
