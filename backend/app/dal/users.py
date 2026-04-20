import sqlite3
from pathlib import Path
from typing import cast

import aiosql

from ..auth import hash_password
from ..database import dict_from_row, dicts_from_rows
from ..dtos.admin import UserUpdateData
from ..dtos.auth import UserInternalRow, UserRow

queries = aiosql.from_path(Path(__file__).parent / "queries" / "users", "sqlite3")


def get_user_by_id(db: sqlite3.Connection, user_id: int) -> UserRow | None:
    return cast(UserRow | None, dict_from_row(queries.get_user_by_id(db, id=user_id)))


def get_user_by_username(db: sqlite3.Connection, username: str) -> UserInternalRow | None:
    return cast(UserInternalRow | None, dict_from_row(queries.get_user_by_username(db, u=username)))


def get_all_users(db: sqlite3.Connection) -> list[UserRow]:
    return cast(list[UserRow], dicts_from_rows(queries.get_all_users(db)))


def create_user(db: sqlite3.Connection, username: str, password: str, role="reader", display_name=None, email=None) -> int:
    user_id = queries.insert_user(db, u=username, h=hash_password(password), r=role, d=display_name, e=email)
    from .shelves import ensure_system_shelves
    ensure_system_shelves(db, user_id)
    return user_id


def update_user(db: sqlite3.Connection, user_id: int, data: UserUpdateData) -> None:
    sets, params = [], {"id": user_id}
    if "displayName" in data:
        sets.append("display_name = :dn")
        params["dn"] = data["displayName"]
    if "email" in data:
        sets.append("email = :em")
        params["em"] = data["email"]
    if "password" in data:
        sets.append("password_hash = :ph")
        params["ph"] = hash_password(data["password"])
    if "role" in data:
        sets.append("role = :role")
        params["role"] = data["role"]
    if sets:
        db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = :id", params)


def delete_user(db: sqlite3.Connection, user_id: int) -> None:
    queries.delete_user(db, id=user_id)


def is_last_admin(db: sqlite3.Connection, user_id: int) -> bool:
    """Check if user_id is an admin and is the last one."""
    target = queries.get_admin_role(db, id=user_id)
    if not target or target["role"] != "admin":
        return False
    count = queries.count_admins(db)["cnt"]
    return count <= 1
