import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from pathlib import Path

import sqlite3

from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from typing import Literal
from pydantic import BaseModel, Field

from ..auth import require_admin
from ..database import db_session

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
_LOGO_PATH = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "public" / "logo.png"


def _build_email(template_name: str, subject: str, from_addr: str, to_addr: str) -> MIMEMultipart:
    html = (_TEMPLATES_DIR / template_name).read_text(encoding="utf-8")
    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.attach(MIMEText(html, "html", "utf-8"))
    if _LOGO_PATH.exists():
        img = MIMEImage(_LOGO_PATH.read_bytes(), _subtype="png")
        img.add_header("Content-ID", "<logo>")
        img.add_header("Content-Disposition", "inline")
        msg.attach(img)
    return msg
import logging

from ..dal import users as users_dal
from ..dal import settings as settings_dal

log = logging.getLogger("librarium.admin")
router = APIRouter(prefix="/api/admin", tags=["admin"])


# --- Users ---

class CreateUserBody(BaseModel):
    username: str = Field(min_length=1, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    password: str = Field(min_length=4)
    role: Literal["admin", "reader"] = "reader"
    displayName: str | None = None
    email: str | None = None


class UpdateUserBody(BaseModel):
    displayName: str | None = None
    email: str | None = None
    password: str | None = None
    role: Literal["admin", "reader"] | None = None


@router.get("/users")
def list_users(request: Request, db: sqlite3.Connection = Depends(db_session)):
    require_admin(request)
    return {"users": users_dal.get_all_users(db)}


@router.post("/users")
def create_user(body: CreateUserBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = require_admin(request)
    uid = users_dal.create_user(db, body.username, body.password, body.role, body.displayName, body.email)
    log.info("Created user=%s role=%s by user_id=%s", body.username, body.role, user["userId"])
    return {"id": uid}


@router.put("/users/{user_id}")
def update_user(user_id: int, body: UpdateUserBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = require_admin(request)
    data = body.model_dump(exclude_none=True)
    if data.get("role") == "reader":
        if users_dal.is_last_admin(db, user_id):
            return JSONResponse({"error": "Нельзя понизить последнего админа"}, status_code=400)
    users_dal.update_user(db, user_id, data)
    log.info("Updated user_id=%d by user_id=%s", user_id, user["userId"])
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = require_admin(request)
    if user["userId"] == user_id:
        return JSONResponse({"error": "Нельзя удалить самого себя"}, status_code=400)
    if users_dal.is_last_admin(db, user_id):
        return JSONResponse({"error": "Нельзя удалить последнего админа"}, status_code=400)
    users_dal.delete_user(db, user_id)
    log.info("Deleted user_id=%d by user_id=%s", user_id, user["userId"])
    return {"ok": True}


# --- Settings ---

_SMTP_PASS_MASK = "••••••"

ALLOWED_SETTINGS = {"app_name", "smtp_host", "smtp_port", "smtp_user", "smtp_pass"}


@router.get("/settings")
def get_settings(request: Request, db: sqlite3.Connection = Depends(db_session)):
    require_admin(request)
    result = settings_dal.get_all_settings(db)
    if result.get("smtp_pass"):
        result["smtp_pass"] = _SMTP_PASS_MASK
    return result


class UpdateSettingsBody(BaseModel):
    app_name: str | None = None
    smtp_host: str | None = None
    smtp_port: str | None = None
    smtp_user: str | None = None
    smtp_pass: str | None = None


@router.put("/settings")
def update_settings(body: UpdateSettingsBody, request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = require_admin(request)
    data = body.model_dump(exclude_none=True)
    # Don't overwrite real password with the mask shown in UI
    if data.get("smtp_pass") == _SMTP_PASS_MASK:
        del data["smtp_pass"]
    changed = []
    for key, value in data.items():
        if key in ALLOWED_SETTINGS:
            settings_dal.set_setting(db, key, value)
            changed.append(key)
    if changed:
        log.info("Updated settings=%s by user_id=%s", ",".join(changed), user["userId"])
    return {"ok": True}


# --- SMTP Test ---

@router.post("/smtp-test")
def smtp_test(request: Request, db: sqlite3.Connection = Depends(db_session)):
    user = require_admin(request)
    host = settings_dal.get_setting(db, "smtp_host")
    port = int(settings_dal.get_setting(db, "smtp_port") or "587")
    smtp_user = settings_dal.get_setting(db, "smtp_user")
    smtp_pass = settings_dal.get_setting(db, "smtp_pass")

    if not host or not smtp_user:
        return JSONResponse({"error": "SMTP не настроен"}, status_code=400)

    db_user = users_dal.get_user_by_id(db, user["userId"])
    if not db_user or not db_user.get("email"):
        return JSONResponse({"error": "У вас не указан email"}, status_code=400)

    try:
        msg = _build_email("smtp_test.html", "Librarium — тест SMTP", smtp_user, db_user["email"])

        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
            server.starttls()

        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        return {"ok": True}
    except Exception as e:
        log.warning("SMTP test failed: %s", e)
        return JSONResponse({"error": "Не удалось отправить тестовое письмо"}, status_code=500)
