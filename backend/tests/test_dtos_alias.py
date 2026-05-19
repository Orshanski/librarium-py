"""Tests for alias_generator + populate_by_name config on body and response models."""
import pytest
from pydantic import ValidationError

from app.dtos.books import (
    BookFileItem,
    BookIdentifierItem,
    DuplicateHitItem,
    UpdateBookBody,
)
from app.dtos._refs import AuthorRef
from app.dtos.entities import MergeBody, TagSummary
from app.dtos.shelves import ShelfBookBody, ShelfSummary


def test_update_book_body_parses_camel_wire_only():
    body = UpdateBookBody.model_validate({"authorIds": [1, 2], "pubDate": "2020-01-01"})
    assert body.author_ids == [1, 2]
    assert body.pub_date == "2020-01-01"


def test_update_book_body_rejects_snake_case_in_wire():
    with pytest.raises(ValidationError):
        UpdateBookBody.model_validate({"author_ids": [1, 2]})


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
