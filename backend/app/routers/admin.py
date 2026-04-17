import logging
import os
import smtplib
import sqlite3
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_admin
from ..dal import settings as settings_dal
from ..dal import users as users_dal
from ..database import db_session

log = logging.getLogger("librarium.admin")

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
def list_users(user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    return {"users": users_dal.get_all_users(db)}


@router.post("/users")
def create_user(body: CreateUserBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    uid = users_dal.create_user(db, body.username, body.password, body.role, body.displayName, body.email)
    log.info("Created user=%s role=%s by user_id=%s", body.username, body.role, user["userId"])
    return {"id": uid}


@router.put("/users/{user_id}")
def update_user(user_id: int, body: UpdateUserBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    data = body.model_dump(exclude_none=True)
    if data.get("role") == "reader":
        if users_dal.is_last_admin(db, user_id):
            raise HTTPException(status_code=400, detail="Нельзя понизить последнего админа")
    users_dal.update_user(db, user_id, data)
    log.info("Updated user_id=%d by user_id=%s", user_id, user["userId"])
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    if user["userId"] == user_id:
        raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")
    if users_dal.is_last_admin(db, user_id):
        raise HTTPException(status_code=400, detail="Нельзя удалить последнего админа")
    users_dal.delete_user(db, user_id)
    log.info("Deleted user_id=%d by user_id=%s", user_id, user["userId"])
    return {"ok": True}


# --- Settings ---

_SMTP_PASS_MASK = "••••••"

ALLOWED_SETTINGS = {"app_name", "smtp_host", "smtp_port", "smtp_user", "smtp_pass"}


@router.get("/settings")
def get_settings(user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
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
def update_settings(body: UpdateSettingsBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
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
def smtp_test(user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    host = settings_dal.get_setting(db, "smtp_host")
    port = int(settings_dal.get_setting(db, "smtp_port") or "587")
    smtp_user = settings_dal.get_setting(db, "smtp_user")
    smtp_pass = settings_dal.get_setting(db, "smtp_pass")

    if not host or not smtp_user:
        raise HTTPException(status_code=400, detail="SMTP не настроен")

    db_user = users_dal.get_user_by_id(db, user["userId"])
    if not db_user or not db_user.get("email"):
        raise HTTPException(status_code=400, detail="У вас не указан email")

    try:
        msg = _build_email("smtp_test.html", "Librarium — тест SMTP", smtp_user, db_user["email"])

        server = None
        try:
            if port == 465:
                server = smtplib.SMTP_SSL(host, port, timeout=15)
            else:
                server = smtplib.SMTP(host, port, timeout=15)
                server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        finally:
            if server:
                try:
                    server.quit()
                except Exception:
                    pass
        return {"ok": True}
    except Exception as e:
        log.warning("SMTP test failed: %s", e)
        raise HTTPException(status_code=500, detail="Не удалось отправить тестовое письмо")
