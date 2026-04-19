import logging
import sqlite3

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, require_admin
from ..database import db_session
from ..dtos import IdResponse, OkResponse
from ..dtos.admin import (
    AdminSettingsResponse, AdminUsersListResponse,
    CreateUserBody, UpdateUserBody, UpdateSettingsBody,
)
from ..services import admin_service, mail_service

log = logging.getLogger("librarium.admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


# --- Users ---

@router.get("/users", response_model=AdminUsersListResponse)
def list_users(user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    return admin_service.list_users(db)


@router.post("/users", response_model=IdResponse)
def create_user(body: CreateUserBody, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    uid = admin_service.create_user(
        db, body.username, body.password, body.role, body.displayName, body.email,
        actor_id=user.user_id,
    )
    return IdResponse(id=uid)


@router.put("/users/{user_id}", response_model=OkResponse)
def update_user(user_id: int, body: UpdateUserBody, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    admin_service.update_user(db, user_id, body, actor_id=user.user_id)
    return OkResponse()


@router.delete("/users/{user_id}", response_model=OkResponse)
def delete_user(user_id: int, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    admin_service.delete_user(db, user_id, actor_id=user.user_id)
    return OkResponse()


# --- Settings ---

@router.get("/settings", response_model=AdminSettingsResponse)
def get_settings(user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    return admin_service.get_settings(db)


@router.put("/settings", response_model=OkResponse)
def update_settings(body: UpdateSettingsBody, user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    admin_service.update_settings(db, body, actor_id=user.user_id)
    return OkResponse()


# --- SMTP Test ---

@router.post("/smtp-test", response_model=OkResponse)
def smtp_test(user: CurrentUser = Depends(require_admin), db: sqlite3.Connection = Depends(db_session)):
    mail_service.send_test_email(db, user.user_id)
    return OkResponse()
