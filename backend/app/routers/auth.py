import logging
import os
import sqlite3

from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse

from ..auth import CurrentUser, get_current_user, get_client_ip, COOKIE_NAME
from ..config import JWT_EXPIRE_HOURS
from ..database import db_session
from ..dtos.auth import AuthUserResponse, LoginRequest
from ..services import auth_service

log = logging.getLogger("librarium.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginRequest, request: Request, db: sqlite3.Connection = Depends(db_session)):
    ip = get_client_ip(request)
    token, user_response = auth_service.login(db, body.username, body.password, ip)
    response = JSONResponse({"ok": True, "user": user_response.model_dump()})
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


@router.get("/me", response_model=AuthUserResponse)
def me(user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    return auth_service.get_me(db, user.user_id)


@router.post("/logout")
def logout(request: Request):
    try:
        user = get_current_user(request)
        log.info("Logout user_id=%s", user.user_id)
    except Exception:
        pass
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE_NAME, path="/")
    return response
