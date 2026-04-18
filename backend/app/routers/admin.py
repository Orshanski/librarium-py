import logging
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_admin
from ..database import db_session
from ..services import admin_service, mail_service

log = logging.getLogger("librarium.admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


# --- Request models ---

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


class UpdateSettingsBody(BaseModel):
    app_name: str | None = None
    smtp_host: str | None = None
    smtp_port: str | None = None
    smtp_user: str | None = None
    smtp_pass: str | None = None


# --- Users ---

@router.get("/users")
def list_users(user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    return admin_service.list_users(db)


@router.post("/users")
def create_user(body: CreateUserBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    uid = admin_service.create_user(
        db, body.username, body.password, body.role, body.displayName, body.email,
        actor_id=user["userId"],
    )
    return {"id": uid}


@router.put("/users/{user_id}")
def update_user(user_id: int, body: UpdateUserBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    admin_service.update_user(db, user_id, body.model_dump(exclude_none=True), actor_id=user["userId"])
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    admin_service.delete_user(db, user_id, actor_id=user["userId"])
    return {"ok": True}


# --- Settings ---

@router.get("/settings")
def get_settings(user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    return admin_service.get_settings(db)


@router.put("/settings")
def update_settings(body: UpdateSettingsBody, user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    admin_service.update_settings(db, body.model_dump(exclude_none=True), actor_id=user["userId"])
    return {"ok": True}


# --- SMTP Test ---

@router.post("/smtp-test")
def smtp_test(user: dict = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    mail_service.send_test_email(db, user["userId"])
    return {"ok": True}
