"""Admin request DTOs, write-input TypedDicts, and Response DTOs."""
from typing import Any, Literal, TypedDict

from pydantic import BaseModel, Field


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


class UserUpdateData(TypedDict, total=False):
    """Partial-update data for `dal.users.update_user`. Keys match
    `UpdateUserBody.model_dump(exclude_none=True)`."""
    displayName: str
    email: str
    password: str
    role: Literal["admin", "reader"]


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only.
# ---------------------------------------------------------------------------


class AdminUserItem(BaseModel):
    """Single user item in the admin users list.

    Uses snake_case field names to match the pre-L4 wire format: the GET
    /api/admin/users endpoint returned raw UserRow dicts which have
    display_name / created_at keys (not camelCase).
    """
    id: int
    username: str
    display_name: str | None = None
    email: str | None = None
    role: Literal["admin", "reader"]
    created_at: str


class AdminUsersListResponse(BaseModel):
    """Response for GET /api/admin/users."""
    users: list[AdminUserItem]


class AdminSettingsResponse(BaseModel):
    """Response for GET /api/admin/settings.

    The settings table is a key/value bag (spec whitelist: stays dict[str, str]).
    We wrap it in a Pydantic model so the router has a response_model annotation,
    but the actual fields are opaque (model_extra='allow') — the shape is
    dynamic per-installation (keys added by admin UI).
    """
    model_config = {"extra": "allow"}

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)

    @classmethod
    def from_dict(cls, d: dict[str, str | None]) -> "AdminSettingsResponse":
        return cls(**d)
