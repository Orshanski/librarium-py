"""Tests for alias_generator + populate_by_name config on body and response models."""
import pytest
from pydantic import ValidationError

from app.dtos.books import BookListItem, UpdateBookBody
from app.dtos._refs import AuthorRef
from app.dtos.entities import MergeBody
from app.dtos.shelves import ShelfBookBody


def test_update_book_body_parses_camel_wire_only():
    body = UpdateBookBody.model_validate({"authorIds": [1, 2], "pubDate": "2020-01-01"})
    assert body.author_ids == [1, 2]
    assert body.pub_date == "2020-01-01"


def test_update_book_body_rejects_snake_case_in_wire():
    with pytest.raises(ValidationError):
        UpdateBookBody.model_validate({"author_ids": [1, 2]})


def test_book_list_item_serialises_camel():
    item = BookListItem(
        id=1, title="X", cover_path="/a", authors=[AuthorRef(id=1, name="A")],
        series=None, series_number=None, tags=[], rating=None, is_read=None,
        added_at="2020", updated_at="2020", sort_title=None, description=None,
        language=None, publisher=None, pub_date=None,
    )
    wire = item.model_dump(by_alias=True)
    assert "coverPath" in wire and "cover_path" not in wire
    assert "addedAt" in wire and "added_at" not in wire
    assert "isRead" in wire and "is_read" not in wire


def test_book_list_item_accepts_snake_for_tests():
    item = BookListItem.model_validate({
        "id": 1, "title": "X", "cover_path": "/a", "authors": [],
        "series": None, "series_number": None, "tags": [], "rating": None,
        "is_read": None, "added_at": "2020", "updated_at": "2020",
        "sort_title": None, "description": None, "language": None,
        "publisher": None, "pub_date": None,
    })
    assert item.cover_path == "/a"


def test_merge_body_python_snake_wire_camel():
    body = MergeBody.model_validate({"sourceId": 7})
    assert body.source_id == 7
    with pytest.raises(ValidationError):
        MergeBody.model_validate({"source_id": 7})


def test_shelf_book_body_python_snake_wire_camel():
    body = ShelfBookBody.model_validate({"bookId": 42})
    assert body.book_id == 42
    with pytest.raises(ValidationError):
        ShelfBookBody.model_validate({"book_id": 42})
