import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
import jwt
from fastapi import Request

from .config import SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_HOURS, JWT_REFRESH_AFTER_HOURS, COOKIE_NAME
from .exceptions import AuthError, ForbiddenError

log = logging.getLogger("librarium.auth")

UserRole = Literal["admin", "reader"]


@dataclass(frozen=True)
class CurrentUser:
    """Typed auth context: the user making the current request.

    Constructed from a decoded JWT payload via `from_payload`. Frozen so
    handlers cannot mutate it mid-request. JWT keys (``userId`` → ``user_id``,
    ``role`` → ``role``) are mapped inside ``from_payload``; consumers read
    the typed attributes, not the raw payload. Extra payload keys
    (e.g. ``iat``, ``exp``) are ignored.

    Precondition: the caller has already verified the JWT signature via
    ``decode_token``. ``from_payload`` only validates payload shape, not
    authenticity.

    Client-visible error contract: any shape violation raises a generic
    ``AuthError("Invalid token")``. The specific malformed-reason is logged
    at WARNING via the ``librarium.auth`` logger for ops diagnostics, but
    never leaks to the client response body.
    """

    user_id: int
    role: UserRole

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "CurrentUser":
        if "userId" not in payload:
            log.warning("JWT malformed: userId missing")
            raise AuthError("Invalid token")
        user_id = payload["userId"]
        # bool-guard: Python treats `bool` as `int` subclass — without this,
        # True / False would pass the int check.
        if isinstance(user_id, bool) or not isinstance(user_id, int):
            log.warning("JWT malformed: userId not int (got %s)", type(user_id).__name__)
            raise AuthError("Invalid token")
        if "role" not in payload:
            log.warning("JWT malformed: role missing")
            raise AuthError("Invalid token")
        role = payload["role"]
        if not isinstance(role, str):
            log.warning("JWT malformed: role not string (got %s)", type(role).__name__)
            raise AuthError("Invalid token")
        if not role:
            log.warning("JWT malformed: role empty")
            raise AuthError("Invalid token")
        # Runtime intentionally accepts any non-empty string so unexpected JWT
        # roles produce ForbiddenError downstream (in require_admin / route
        # guards), not AuthError here. Literal is type-level only; the ignore
        # documents the deliberate runtime widening of the nominal type.
        return cls(user_id=user_id, role=role)  # type: ignore[arg-type]


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "userId": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])


def get_current_user(request: Request) -> dict[str, Any]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise AuthError("Not authenticated")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise AuthError("Token expired")
    except jwt.InvalidTokenError:
        raise AuthError("Invalid token")
    if token_needs_refresh(payload):
        request.state._refresh_token = True
        request.state._refresh_user_id = payload["userId"]
        request.state._refresh_role = payload["role"]
    return payload


def token_needs_refresh(payload: dict[str, Any]) -> bool:
    """Check if token is older than JWT_REFRESH_AFTER_HOURS."""
    iat = payload.get("iat")
    if not iat:
        return False
    # iat is stored as datetime in create_token but PyJWT decodes it as unix timestamp
    issued_at = datetime.fromtimestamp(iat, tz=timezone.utc)
    age = datetime.now(timezone.utc) - issued_at
    return age > timedelta(hours=JWT_REFRESH_AFTER_HOURS)


def get_client_ip(request: Request) -> str:
    return (
        request.headers.get("X-Real-IP")
        or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )


def require_admin(request: Request) -> dict[str, Any]:
    user = get_current_user(request)
    if user.get("role") != "admin":
        raise ForbiddenError("Admin access required")
    return user
