"""Unit tests for routers.params.parse_ids — contract: None | non-empty list[int]."""
from app.routers.params import parse_ids


def test_parse_ids_empty_string_returns_none():
    assert parse_ids("") is None


def test_parse_ids_single_id():
    assert parse_ids("42") == [42]


def test_parse_ids_multiple_ids():
    assert parse_ids("1,2,3") == [1, 2, 3]


def test_parse_ids_with_whitespace():
    assert parse_ids(" 1 , 2 , 3 ") == [1, 2, 3]


def test_parse_ids_mixed_valid_invalid():
    # Non-digit tokens silently dropped
    assert parse_ids("1,abc,3") == [1, 3]


def test_parse_ids_all_invalid_returns_none():
    # All tokens non-digit → empty list → collapsed to None
    assert parse_ids("abc,def") is None


def test_parse_ids_only_commas_returns_none():
    assert parse_ids(",,,") is None


def test_parse_ids_negative_numbers_dropped():
    # "-1".isdigit() is False, so negative numbers are dropped
    assert parse_ids("-1,2") == [2]
