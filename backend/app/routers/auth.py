import logging
import os
import time
from collections import defaultdict

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..auth import verify_password, create_token, get_current_user, get_client_ip, COOKIE_NAME
from ..database import get_db, dict_from_row

log = logging.getLogger("librarium.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])

_MAX_ATTEMPTS = 5
_WINDOW_SEC = 300  # 5 minutes
_login_attempts: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(ip: str) -> bool:
    """Returns True if request is allowed, False if rate-limited."""
    now = time.monotonic()
    attempts = _login_attempts[ip]
    _login_attempts[ip] = [t for t in attempts if now - t < _WINDOW_SEC]
    if not _login_attempts[ip]:
        del _login_attempts[ip]
        return True
    return len(_login_attempts[ip]) < _MAX_ATTEMPTS


def _record_attempt(ip: str):
    _login_attempts[ip].append(time.monotonic())


def _clear_attempts(ip: str):
    _login_attempts.pop(ip, None)


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginRequest, request: Request):
    ip = get_client_ip(request)
    if not _check_rate_limit(ip):
        log.warning("Login RATE LIMITED ip=%s", ip)
        raise HTTPException(status_code=429, detail="Too many login attempts, try again later")

    db = get_db()
    row = db.execute(
        "SELECT id, username, display_name, email, password_hash, role FROM users WHERE username = ?",
        (body.username,),
    ).fetchone()

    if not row or not verify_password(body.password, row["password_hash"]):
        _record_attempt(ip)
        log.warning("Login FAILED user=%s ip=%s", body.username, ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    _clear_attempts(ip)
    log.info("Login OK user=%s ip=%s", row["username"], ip)
    token = create_token(row["id"], row["role"])
    response = JSONResponse({"ok": True, "user": {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "role": row["role"],
    }})
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=os.environ.get("SECURE_COOKIE", "").lower() in ("1", "true"),
        max_age=72 * 3600,
        path="/",
    )
    return response


@router.get("/me")
def me(request: Request):
    user = get_current_user(request)
    db = get_db()
    row = db.execute(
        "SELECT id, username, display_name, email, role FROM users WHERE id = ?",
        (user["userId"],),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "email": row["email"],
        "role": row["role"],
    }


@router.post("/logout")
def logout(request: Request):
    try:
        user = get_current_user(request)
        log.info("Logout user_id=%s", user["userId"])
    except Exception:
        pass
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE_NAME, path="/")
    return response
