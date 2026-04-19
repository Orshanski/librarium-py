"""Auth request DTOs."""
from typing import Literal, TypedDict

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


# ---------------------------------------------------------------------------
# Read-path TypedDicts — one per distinct SELECT shape (R-A).
# ---------------------------------------------------------------------------


class UserRow(TypedDict):
    """Public user shape from dal.users.get_user_by_id / get_all_users.
    Columns: id, username, display_name, email, role, created_at.
    Does NOT include password_hash — R-A: distinct from UserInternalRow."""
    id: int
    username: str
    display_name: str | None
    email: str | None
    role: Literal["admin", "reader"]
    created_at: str


class UserInternalRow(TypedDict):
    """Internal user shape from dal.users.get_user_by_username (SELECT *).
    Includes password_hash for the login verify path.
    R-A: structurally distinct from UserRow — separate TypedDict."""
    id: int
    username: str
    password_hash: str
    display_name: str | None
    email: str | None
    role: Literal["admin", "reader"]
    created_at: str
