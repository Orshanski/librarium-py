"""Admin service — users CRUD + settings (no mail/SMTP)."""
import logging
import sqlite3

from ..dal import settings as settings_dal
from ..dal import users as users_dal
from ..exceptions import BadInputError

log = logging.getLogger("librarium.admin")

_ALLOWED_SETTINGS = {"app_name", "smtp_host", "smtp_port", "smtp_user", "smtp_pass"}
_SMTP_PASS_MASK = "••••••"


# --- Users ---

def list_users(db: sqlite3.Connection) -> dict:
    return {"users": users_dal.get_all_users(db)}


def create_user(db: sqlite3.Connection, username: str, password: str, role: str,
                display_name: str | None, email: str | None, actor_id: int) -> int:
    uid = users_dal.create_user(db, username, password, role, display_name, email)
    log.info("Created user=%s role=%s by user_id=%s", username, role, actor_id)
    return uid


def update_user(db: sqlite3.Connection, user_id: int, data: dict, actor_id: int) -> None:
    if data.get("role") == "reader" and users_dal.is_last_admin(db, user_id):
        raise BadInputError("Нельзя понизить последнего админа")
    users_dal.update_user(db, user_id, data)
    log.info("Updated user_id=%d by user_id=%s", user_id, actor_id)


def delete_user(db: sqlite3.Connection, user_id: int, actor_id: int) -> None:
    if actor_id == user_id:
        raise BadInputError("Нельзя удалить самого себя")
    if users_dal.is_last_admin(db, user_id):
        raise BadInputError("Нельзя удалить последнего админа")
    users_dal.delete_user(db, user_id)
    log.info("Deleted user_id=%d by user_id=%s", user_id, actor_id)


# --- Settings ---

def get_settings(db: sqlite3.Connection) -> dict:
    result = settings_dal.get_all_settings(db)
    if result.get("smtp_pass"):
        result["smtp_pass"] = _SMTP_PASS_MASK
    return result


def update_settings(db: sqlite3.Connection, data: dict, actor_id: int) -> None:
    # Don't overwrite real password with mask shown in UI
    if data.get("smtp_pass") == _SMTP_PASS_MASK:
        del data["smtp_pass"]
    changed = []
    for key, value in data.items():
        if key in _ALLOWED_SETTINGS:
            settings_dal.set_setting(db, key, value)
            changed.append(key)
    if changed:
        log.info("Updated settings=%s by user_id=%s", ",".join(changed), actor_id)
