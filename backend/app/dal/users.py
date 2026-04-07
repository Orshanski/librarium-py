from ..database import get_db, dict_from_row, dicts_from_rows
from ..auth import hash_password


def get_user_by_id(user_id: int):
    db = get_db()
    return dict_from_row(db.execute(
        "SELECT id, username, display_name, email, role, created_at FROM users WHERE id = :id",
        {"id": user_id},
    ).fetchone())


def get_user_by_username(username: str):
    db = get_db()
    return dict_from_row(db.execute(
        "SELECT * FROM users WHERE username = :u", {"u": username}
    ).fetchone())


def get_all_users():
    db = get_db()
    return dicts_from_rows(db.execute(
        "SELECT id, username, display_name, email, role, created_at FROM users ORDER BY id"
    ).fetchall())


def create_user(username: str, password: str, role="reader", display_name=None, email=None) -> int:
    db = get_db()
    cur = db.execute(
        "INSERT INTO users (username, password_hash, role, display_name, email) VALUES (:u, :h, :r, :d, :e)",
        {"u": username, "h": hash_password(password), "r": role, "d": display_name, "e": email},
    )
    return cur.lastrowid


def update_user(user_id: int, data: dict):
    db = get_db()
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
    

def delete_user(user_id: int):
    db = get_db()
    db.execute("DELETE FROM users WHERE id = :id", {"id": user_id})
