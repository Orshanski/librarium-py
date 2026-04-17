"""Unit tests for shared assertion helpers."""
from types import SimpleNamespace

import pytest

from tests._helpers.assertions import assert_error, assert_ok, assert_not_found


def _mk_resp(status: int, body: dict, text: str = ""):
    return SimpleNamespace(
        status_code=status,
        json=lambda: body,
        text=text or str(body),
    )


# --- assert_error: HTTPException (string detail) ---

def test_assert_error_status_ok():
    assert_error(_mk_resp(404, {"detail": "Not found"}), 404)


def test_assert_error_wrong_status():
    with pytest.raises(AssertionError, match="Expected status 404, got 500"):
        assert_error(_mk_resp(500, {"detail": "x"}), 404)


def test_assert_error_missing_detail():
    with pytest.raises(AssertionError, match="Expected 'detail' key"):
        assert_error(_mk_resp(400, {"error": "x"}), 400)


def test_assert_error_message_matches_string_detail():
    resp = _mk_resp(400, {"detail": "Title required"})
    assert_error(resp, 400, message_matches="title")
    assert_error(resp, 400, message_matches="REQUIRED")  # case-insensitive


def test_assert_error_message_mismatch_string_detail():
    with pytest.raises(AssertionError, match="Expected substring"):
        assert_error(_mk_resp(400, {"detail": "something else"}), 400,
                     message_matches="title")


# --- assert_error: Pydantic 422 (list detail) ---

def test_assert_error_pydantic_422_passes():
    body = {"detail": [
        {"type": "missing", "loc": ["body", "title"], "msg": "Field required"},
    ]}
    assert_error(_mk_resp(422, body), 422)


def test_assert_error_pydantic_422_message_matches():
    body = {"detail": [
        {"type": "missing", "loc": ["body", "title"], "msg": "Field required"},
    ]}
    assert_error(_mk_resp(422, body), 422, message_matches="field required")


def test_assert_error_pydantic_422_message_mismatch():
    body = {"detail": [
        {"type": "string_too_short", "loc": ["body", "name"],
         "msg": "String should have at least 1 character"},
    ]}
    with pytest.raises(AssertionError, match="Expected substring"):
        assert_error(_mk_resp(422, body), 422, message_matches="nothing-like-that")


# --- assert_ok ---

def test_assert_ok_default_200():
    assert assert_ok(_mk_resp(200, {"hello": "world"})) == {"hello": "world"}


def test_assert_ok_custom_status():
    assert assert_ok(_mk_resp(201, {"id": 1}), status=201) == {"id": 1}


def test_assert_ok_wrong_status():
    with pytest.raises(AssertionError, match="Expected status 200, got 400"):
        assert_ok(_mk_resp(400, {"detail": "x"}))


# --- assert_not_found ---

def test_assert_not_found_delegates():
    assert_not_found(_mk_resp(404, {"detail": "Book not found"}),
                     message_matches="book not found")


def test_assert_not_found_wrong_status():
    with pytest.raises(AssertionError, match="Expected status 404"):
        assert_not_found(_mk_resp(400, {"detail": "x"}))
