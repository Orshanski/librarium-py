"""Tests for alias_generator + populate_by_name config on body and response models."""
import pytest
from pydantic import ValidationError

from app.dtos.books import (
    BookFileItem,
    BookIdentifierItem,
    BookItem,
    BookListItem,
    DuplicateHitItem,
    UpdateBookBody,
)
from app.dtos._refs import AuthorRef
from app.dtos.entities import EntityBookItem, MergeBody, TagDetailBookItem, TagSummary
from app.dtos.shelves import ShelfBookBody, ShelfSummary


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


def test_update_book_body_rejects_unknown_camel_key():
    """extra='forbid' rejects unknown camelCase keys, not just snake."""
    with pytest.raises(ValidationError):
        UpdateBookBody.model_validate({"unknownField": "x"})


def test_book_file_item_serialises_camel():
    item = BookFileItem(id=1, format="EPUB", file_size=1024)
    wire = item.model_dump(by_alias=True)
    assert "fileSize" in wire and "file_size" not in wire


def test_book_identifier_item_serialises_camel():
    item = BookIdentifierItem(type="isbn", value="978-0-000-00001-0")
    wire = item.model_dump(by_alias=True)
    assert wire == {"type": "isbn", "value": "978-0-000-00001-0"}


def test_duplicate_hit_item_serialises_camel():
    item = DuplicateHitItem(id=1, title="X", authors=[AuthorRef(id=1, name="A")])
    wire = item.model_dump(by_alias=True)
    assert wire == {"id": 1, "title": "X", "authors": [{"id": 1, "name": "A"}]}


def test_entity_book_item_serialises_camel():
    item = EntityBookItem(
        id=1, title="X", sort_title=None, pub_date=None,
        series=None, series_number=None, cover_path=None,
        added_at="2020", updated_at="2020",
        authors=[AuthorRef(id=1, name="A")], tags=[],
    )
    wire = item.model_dump(by_alias=True)
    assert "coverPath" in wire and "cover_path" not in wire
    assert "addedAt" in wire and "added_at" not in wire


def test_tag_detail_book_item_serialises_camel():
    item = TagDetailBookItem(
        id=1, title="X", sort_title=None, pub_date=None,
        series=None, series_number=None, cover_path=None,
        added_at="2020", updated_at="2020",
        authors=[], tags=[], rating=None, is_read=None,
    )
    wire = item.model_dump(by_alias=True)
    assert "isRead" in wire and "is_read" not in wire


def test_book_item_serialises_camel():
    """BookItem after unification — snake fields, camel aliases on wire."""
    item = BookItem(
        id=1, title="X", cover_path="/a",
        authors=[AuthorRef(id=1, name="A")], tags=[],
        added_at="2020", updated_at="2020",
    )
    wire = item.model_dump(by_alias=True)
    assert "coverPath" in wire and "cover_path" not in wire
    assert "addedAt" in wire and "added_at" not in wire


def test_shelf_summary_serialises_camel():
    """ShelfSummary after unification — snake fields, camel aliases on wire."""
    item = ShelfSummary(id=1, name="X", is_system=True, system_code="best")
    wire = item.model_dump(by_alias=True)
    assert wire == {"id": 1, "name": "X", "isSystem": True, "systemCode": "best"}


def test_tag_summary_serialises_camel():
    item = TagSummary(id=1, name="X", code="abc")
    wire = item.model_dump(by_alias=True)
    assert wire == {"id": 1, "name": "X", "code": "abc"}


def test_catalog_filters_typed_dict_does_not_have_user_id():
    """Regression: bd librarium-py-bv0e — userId must not be a field of CatalogFilters."""
    from typing import get_type_hints
    from app.dtos.catalog import CatalogFilters
    hints = get_type_hints(CatalogFilters)
    assert "userId" not in hints
    assert "user_id" not in hints
