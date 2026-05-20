"""Unit tests for reader_service.get_or_create_device_id (pure function)."""
import uuid

from app.services.reader_service import get_or_create_device_id


def test_get_or_create_device_id_existing_uuid_returns_same():
    existing = "11111111-1111-4111-8111-111111111111"
    result = get_or_create_device_id(existing)
    assert result == existing


def test_get_or_create_device_id_invalid_replaced_with_uuid():
    # Любой не-UUID payload (включая attacker-supplied данные с CR/LF и т.п.)
    # отбрасывается и заменяется свежим device id.
    result = get_or_create_device_id("not-a-uuid")
    assert result != "not-a-uuid"
    uuid.UUID(result)


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
