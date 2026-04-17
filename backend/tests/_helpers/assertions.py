"""Shared assertion helpers for API tests.

Target error contract: {"detail": <str> | <list of validation errors>}.

FastAPI uses `detail` for both cases:
- App-raised HTTPException → detail is a str.
- Pydantic validation (422) → detail is a list of {type, loc, msg, ...} objects.

`assert_error` accepts both. `message_matches` does a case-insensitive
substring search — in the string form directly, or in the joined `msg`
fields of the list form.
"""
from typing import Any


def assert_error(resp, status: int, *, message_matches: str | None = None) -> None:
    """
    Check an error response:
    - HTTP status == status
    - payload is JSON with a "detail" key (str or list per FastAPI contract)
    - optional case-insensitive substring match against detail
    """
    assert resp.status_code == status, (
        f"Expected status {status}, got {resp.status_code}. Body: {resp.text}"
    )
    detail = resp.json().get("detail")
    assert detail is not None, f"Expected 'detail' key in response: {resp.text}"

    if message_matches is None:
        return

    if isinstance(detail, str):
        text = detail
    else:
        text = " ".join(item.get("msg", "") for item in detail if isinstance(item, dict))

    assert message_matches.lower() in text.lower(), (
        f"Expected substring {message_matches!r} in detail, got {detail!r}"
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
