"""Authentication service — login, current-user, logout.

Rate-limit state is module-level and process-local (same scope as before
the extraction from the router).
"""
import logging
import sqlite3
import threading
import time
from collections import defaultdict

from ..auth import create_token, verify_password
from ..dal import users as dal
from ..exceptions import AuthError, RateLimitError

log = logging.getLogger("librarium.auth")

_MAX_ATTEMPTS = 5
_WINDOW_SEC = 300
_MAX_TRACKED_IPS = 10_000
_login_attempts_lock = threading.Lock()
_login_attempts: dict[str, list[float]] = defaultdict(list)


def _purge_expired_locked(now: float) -> None:
    """Caller must hold _login_attempts_lock."""
    expired = [ip for ip, ts in _login_attempts.items()
               if all(now - t >= _WINDOW_SEC for t in ts)]
    for ip in expired:
        del _login_attempts[ip]


def _check_rate_limit(ip: str) -> bool:
    with _login_attempts_lock:
        now = time.monotonic()
        if len(_login_attempts) > _MAX_TRACKED_IPS:
            _purge_expired_locked(now)
        attempts = _login_attempts[ip]
        _login_attempts[ip] = [t for t in attempts if now - t < _WINDOW_SEC]
        if not _login_attempts[ip]:
            del _login_attempts[ip]
            return True
        return len(_login_attempts[ip]) < _MAX_ATTEMPTS


def _record_attempt(ip: str) -> None:
    with _login_attempts_lock:
        _login_attempts[ip].append(time.monotonic())


def _clear_attempts(ip: str) -> None:
    with _login_attempts_lock:
        _login_attempts.pop(ip, None)


def login(db: sqlite3.Connection, username: str, password: str, ip: str) -> tuple[str, dict]:
    """Authenticate user. Returns (token, user_public_dict).

    Raises:
      RateLimitError: if too many attempts from ip
      AuthError: on invalid credentials
    """
    if not _check_rate_limit(ip):
        log.warning("Login RATE LIMITED ip=%s", ip)
        raise RateLimitError("Too many login attempts, try again later")

    user = dal.get_user_by_username(db, username)
    if not user or not verify_password(password, user["password_hash"]):
        _record_attempt(ip)
        log.warning("Login FAILED user=%s ip=%s", username, ip)
        raise AuthError("Invalid credentials")

    _clear_attempts(ip)
    log.info("Login OK user=%s ip=%s", user["username"], ip)
    token = create_token(user["id"], user["role"])
    return token, {
        "id": user["id"],
        "username": user["username"],
        "displayName": user["display_name"],
        "email": user.get("email"),
        "role": user["role"],
    }


def get_me(db: sqlite3.Connection, user_id: int) -> dict:
    db_user = dal.get_user_by_id(db, user_id)
    if not db_user:
        raise AuthError("User not found")
    return {
        "id": db_user["id"],
        "username": db_user["username"],
        "displayName": db_user["display_name"],
        "email": db_user["email"],
        "role": db_user["role"],
    }
