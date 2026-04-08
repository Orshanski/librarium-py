import logging
import os
import sqlite3
import time
from collections import defaultdict

from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..auth import verify_password, create_token, get_current_user, get_client_ip, COOKIE_NAME
from ..config import JWT_EXPIRE_HOURS
from ..database import db_session
from ..dal import users as users_dal

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
def login(body: LoginRequest, request: Request, db: sqlite3.Connection = Depends(db_session)):
    ip = get_client_ip(request)
    if not _check_rate_limit(ip):
        log.warning("Login RATE LIMITED ip=%s", ip)
        raise HTTPException(status_code=429, detail="Too many login attempts, try again later")

    user = users_dal.get_user_by_username(db, body.username)

    if not user or not verify_password(body.password, user["password_hash"]):
        _record_attempt(ip)
        log.warning("Login FAILED user=%s ip=%s", body.username, ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    _clear_attempts(ip)
    log.info("Login OK user=%s ip=%s", user["username"], ip)
    token = create_token(user["id"], user["role"])
    response = JSONResponse({"ok": True, "user": {
        "id": user["id"],
        "username": user["username"],
        "displayName": user["display_name"],
        "role": user["role"],
    }})
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=os.environ.get("SECURE_COOKIE", "").lower() in ("1", "true"),
        max_age=JWT_EXPIRE_HOURS * 3600,
        path="/",
    )
    return response


@router.get("/me")
def me(request: Request, db: sqlite3.Connection = Depends(db_session)):
    token_data = get_current_user(request)
    user = users_dal.get_user_by_id(db, token_data["userId"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {
        "id": user["id"],
        "username": user["username"],
        "displayName": user["display_name"],
        "email": user["email"],
        "role": user["role"],
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
