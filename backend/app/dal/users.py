import sqlite3

from ..database import dict_from_row, dicts_from_rows
from ..auth import hash_password


def get_user_by_id(db: sqlite3.Connection, user_id: int):
    return dict_from_row(db.execute(
        "SELECT id, username, display_name, email, role, created_at FROM users WHERE id = :id",
        {"id": user_id},
    ).fetchone())


def get_user_by_username(db: sqlite3.Connection, username: str):
    return dict_from_row(db.execute(
        "SELECT * FROM users WHERE username = :u", {"u": username}
    ).fetchone())


def get_all_users(db: sqlite3.Connection):
    return dicts_from_rows(db.execute(
        "SELECT id, username, display_name, email, role, created_at FROM users ORDER BY id"
    ).fetchall())


def create_user(db: sqlite3.Connection, username: str, password: str, role="reader", display_name=None, email=None) -> int:
    cur = db.execute(
        "INSERT INTO users (username, password_hash, role, display_name, email) VALUES (:u, :h, :r, :d, :e)",
        {"u": username, "h": hash_password(password), "r": role, "d": display_name, "e": email},
    )
    user_id = cur.lastrowid
    from .shelves import ensure_system_shelves
    ensure_system_shelves(db, user_id)
    return user_id


def update_user(db: sqlite3.Connection, user_id: int, data: dict):
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


def delete_user(db: sqlite3.Connection, user_id: int):
    db.execute("DELETE FROM users WHERE id = :id", {"id": user_id})


def is_last_admin(db: sqlite3.Connection, user_id: int) -> bool:
    """Check if user_id is an admin and is the last one."""
    target = db.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target or target["role"] != "admin":
        return False
    count = db.execute("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").fetchone()["cnt"]
    return count <= 1
