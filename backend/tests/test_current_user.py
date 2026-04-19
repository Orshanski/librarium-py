"""Unit tests for CurrentUser — typed auth context from JWT payload.

Factory validates payload shape before construction; frozen dataclass
prevents mutation inside request handlers.
"""
import pytest
from dataclasses import FrozenInstanceError

from app.auth import CurrentUser
from app.exceptions import AuthError


def test_from_payload_happy_path():
    user = CurrentUser.from_payload({"userId": 42, "role": "admin", "iat": 1, "exp": 2})
    assert user.user_id == 42
    assert user.role == "admin"


def test_from_payload_happy_path_reader():
    user = CurrentUser.from_payload({"userId": 7, "role": "reader"})
    assert user.user_id == 7
    assert user.role == "reader"


def test_from_payload_missing_user_id():
    with pytest.raises(AuthError):
        CurrentUser.from_payload({"role": "admin"})


def test_from_payload_missing_role():
    with pytest.raises(AuthError):
        CurrentUser.from_payload({"userId": 1})


def test_from_payload_user_id_not_int():
    with pytest.raises(AuthError):
        CurrentUser.from_payload({"userId": "not-int", "role": "admin"})


def test_from_payload_role_empty_string():
    with pytest.raises(AuthError):
        CurrentUser.from_payload({"userId": 1, "role": ""})


def test_current_user_is_frozen():
    user = CurrentUser(user_id=1, role="admin")
    with pytest.raises(FrozenInstanceError):
        user.role = "reader"  # type: ignore[misc]
