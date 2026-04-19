import logging
import sqlite3

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, require_admin
from ..database import db_session
from ..dtos.admin import CreateUserBody, UpdateUserBody, UpdateSettingsBody
from ..services import admin_service, mail_service

log = logging.getLogger("librarium.admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


# --- Users ---

@router.get("/users")
def list_users(user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    return admin_service.list_users(db)


@router.post("/users")
def create_user(body: CreateUserBody, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    uid = admin_service.create_user(
        db, body.username, body.password, body.role, body.displayName, body.email,
        actor_id=user.user_id,
    )
    return {"id": uid}


@router.put("/users/{user_id}")
def update_user(user_id: int, body: UpdateUserBody, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    admin_service.update_user(db, user_id, body, actor_id=user.user_id)
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    admin_service.delete_user(db, user_id, actor_id=user.user_id)
    return {"ok": True}


# --- Settings ---

@router.get("/settings")
def get_settings(user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    return admin_service.get_settings(db)


@router.put("/settings")
def update_settings(body: UpdateSettingsBody, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    admin_service.update_settings(db, body, actor_id=user.user_id)
    return {"ok": True}


# --- SMTP Test ---

@router.post("/smtp-test")
def smtp_test(user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    mail_service.send_test_email(db, user.user_id)
    return {"ok": True}
