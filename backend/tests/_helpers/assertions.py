"""Shared assertion helpers for API tests.

Target error contract: {"detail": "<message>"}.
- assert_error: status + shape + (optional) message substring.
- assert_ok: status, returns JSON payload.
- assert_not_found: delegate for 404.
"""
from typing import Any


def assert_error(resp, status: int, *, message_matches: str | None = None) -> None:
    """
    Check an error response against the target contract:
    - HTTP status == status
    - JSON payload is a dict with "detail": str
    - if message_matches is provided, substring match (case-insensitive)
    """
    assert resp.status_code == status, (
        f"Expected status {status}, got {resp.status_code}. Body: {resp.text}"
    )
    body = resp.json()
    assert isinstance(body, dict), (
        f"Expected JSON object, got {type(body).__name__}: {body}"
    )
    assert "detail" in body, (
        f"Expected key 'detail' in error response, got keys {list(body)}"
    )
    assert isinstance(body["detail"], str), (
        f"Expected 'detail' to be str, got {type(body['detail']).__name__}: {body['detail']}"
    )
    if message_matches is not None:
        assert message_matches.lower() in body["detail"].lower(), (
            f"Expected substring {message_matches!r} in detail, got {body['detail']!r}"
        )


def assert_ok(resp, *, status: int = 200) -> Any:
    """
    Check a successful response:
    - HTTP status == status (default 200; pass explicit status for 201/202/...)
    Returns parsed JSON payload.
    """
    assert resp.status_code == status, (
        f"Expected status {status}, got {resp.status_code}. Body: {resp.text}"
    )
    return resp.json()


def assert_not_found(resp, *, message_matches: str | None = None) -> None:
    """Shortcut for 404."""
    assert_error(resp, 404, message_matches=message_matches)
