"""Unit tests for shared assertion helpers."""
from types import SimpleNamespace

import pytest

from tests._helpers.assertions import assert_error, assert_ok, assert_not_found


def _mk_resp(status: int, body: dict | list, text: str = ""):
    """Build a minimal fake response object."""
    return SimpleNamespace(
        status_code=status,
        json=lambda: body,
        text=text or str(body),
    )


# --- assert_error ---

def test_assert_error_happy_path():
    resp = _mk_resp(404, {"detail": "Not found"})
    assert_error(resp, 404)  # should not raise


def test_assert_error_wrong_status():
    resp = _mk_resp(500, {"detail": "x"})
    with pytest.raises(AssertionError, match="Expected status 404, got 500"):
        assert_error(resp, 404)


def test_assert_error_missing_detail_key():
    resp = _mk_resp(400, {"error": "x"})
    with pytest.raises(AssertionError, match="Expected key 'detail'"):
        assert_error(resp, 400)


def test_assert_error_detail_not_string():
    resp = _mk_resp(400, {"detail": 123})
    with pytest.raises(AssertionError, match="Expected 'detail' to be str"):
        assert_error(resp, 400)


def test_assert_error_body_not_dict():
    resp = _mk_resp(400, ["not", "a", "dict"])
    with pytest.raises(AssertionError, match="Expected JSON object"):
        assert_error(resp, 400)


def test_assert_error_message_matches():
    resp = _mk_resp(400, {"detail": "Title required"})
    assert_error(resp, 400, message_matches="title")  # case-insensitive
    assert_error(resp, 400, message_matches="REQUIRED")


def test_assert_error_message_mismatch():
    resp = _mk_resp(400, {"detail": "something else"})
    with pytest.raises(AssertionError, match="Expected substring"):
        assert_error(resp, 400, message_matches="title")


# --- assert_ok ---

def test_assert_ok_default_200():
    resp = _mk_resp(200, {"hello": "world"})
    assert assert_ok(resp) == {"hello": "world"}


def test_assert_ok_custom_status():
    resp = _mk_resp(201, {"id": 1})
    assert assert_ok(resp, status=201) == {"id": 1}


def test_assert_ok_wrong_status():
    resp = _mk_resp(400, {"detail": "x"})
    with pytest.raises(AssertionError, match="Expected status 200, got 400"):
        assert_ok(resp)


# --- assert_not_found ---

def test_assert_not_found_delegates():
    resp = _mk_resp(404, {"detail": "Book not found"})
    assert_not_found(resp, message_matches="book not found")


def test_assert_not_found_wrong_status():
    resp = _mk_resp(400, {"detail": "x"})
    with pytest.raises(AssertionError, match="Expected status 404"):
        assert_not_found(resp)
