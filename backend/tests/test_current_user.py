"""Unit tests for CurrentUser — typed auth context from JWT payload.

Factory validates payload shape before construction. On any shape violation,
the client sees a generic ``AuthError("Invalid token")``; ops sees a specific
reason in the ``librarium.auth`` WARNING log.
"""
import logging

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


def test_from_payload_missing_user_id(caplog):
    with pytest.raises(AuthError, match="Invalid token"), \
         caplog.at_level(logging.WARNING, logger="librarium.auth"):
        CurrentUser.from_payload({"role": "admin"})
    assert "userId missing" in caplog.text


def test_from_payload_user_id_not_int(caplog):
    with pytest.raises(AuthError, match="Invalid token"), \
         caplog.at_level(logging.WARNING, logger="librarium.auth"):
        CurrentUser.from_payload({"userId": "not-int", "role": "admin"})
    assert "userId not int" in caplog.text


def test_from_payload_user_id_bool_true_rejected(caplog):
    with pytest.raises(AuthError, match="Invalid token"), \
         caplog.at_level(logging.WARNING, logger="librarium.auth"):
        CurrentUser.from_payload({"userId": True, "role": "admin"})
    assert "userId not int" in caplog.text


def test_from_payload_user_id_bool_false_rejected(caplog):
    with pytest.raises(AuthError, match="Invalid token"), \
         caplog.at_level(logging.WARNING, logger="librarium.auth"):
        CurrentUser.from_payload({"userId": False, "role": "admin"})
    assert "userId not int" in caplog.text


def test_from_payload_missing_role(caplog):
    with pytest.raises(AuthError, match="Invalid token"), \
         caplog.at_level(logging.WARNING, logger="librarium.auth"):
        CurrentUser.from_payload({"userId": 1})
    assert "role missing" in caplog.text


@pytest.mark.parametrize("bad_role", [None, 123, [], {}])
def test_from_payload_role_not_string(caplog, bad_role):
    with pytest.raises(AuthError, match="Invalid token"), \
         caplog.at_level(logging.WARNING, logger="librarium.auth"):
        CurrentUser.from_payload({"userId": 1, "role": bad_role})
    assert "role not string" in caplog.text


def test_from_payload_role_empty_string(caplog):
    with pytest.raises(AuthError, match="Invalid token"), \
         caplog.at_level(logging.WARNING, logger="librarium.auth"):
        CurrentUser.from_payload({"userId": 1, "role": ""})
    assert "role empty" in caplog.text


def test_from_payload_result_is_frozen():
    user = CurrentUser(user_id=1, role="admin")
    with pytest.raises(FrozenInstanceError):
        user.role = "reader"  # type: ignore[misc]
