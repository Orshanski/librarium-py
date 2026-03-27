from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import os
from ..auth import verify_password, create_token, get_current_user, COOKIE_NAME
from ..database import get_db, dict_from_row

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginRequest):
    db = get_db()
    row = db.execute(
        "SELECT id, username, display_name, email, password_hash, role FROM users WHERE username = ?",
        (body.username,),
    ).fetchone()

    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

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
def logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(COOKIE_NAME, path="/")
    return response
