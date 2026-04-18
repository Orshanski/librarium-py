"""Unit tests for reader_service.get_or_create_device_id (pure function)."""
import uuid

from app.services.reader_service import get_or_create_device_id


def test_get_or_create_device_id_existing_returns_same():
    result = get_or_create_device_id("abc-123")
    assert result == "abc-123"


def test_get_or_create_device_id_none_generates_uuid():
    result = get_or_create_device_id(None)
    # Must be a valid UUID string
    uuid.UUID(result)


def test_get_or_create_device_id_empty_string_generates_uuid():
    # Empty string is falsy — should regenerate, matching pre-migration behavior
    result = get_or_create_device_id("")
    assert result != ""
    uuid.UUID(result)


def test_get_or_create_device_id_generates_unique():
    a = get_or_create_device_id(None)
    b = get_or_create_device_id(None)
    assert a != b
