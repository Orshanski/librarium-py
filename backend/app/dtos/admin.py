"""Admin request DTOs, write-input TypedDicts, and Response DTOs."""
from typing import Literal, TypedDict

from pydantic import BaseModel, ConfigDict, Field

from ._aliases import BODY_CONFIG, RESPONSE_CONFIG, to_camel


class CreateUserBody(BaseModel):
    model_config = BODY_CONFIG
    username: str = Field(min_length=1, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    password: str = Field(min_length=4)
    role: Literal["admin", "reader"] = "reader"
    displayName: str | None = None
    email: str | None = None


class UpdateUserBody(BaseModel):
    model_config = BODY_CONFIG
    displayName: str | None = None
    email: str | None = None
    password: str | None = Field(default=None, min_length=4)
    role: Literal["admin", "reader"] | None = None


class UpdateSettingsBody(BaseModel):
    model_config = BODY_CONFIG
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


class AdminUserResponse(BaseModel):
    """Один пользователь в ответе GET /api/admin/users — camelCase wire
    поверх snake-колонок DAL (populate_by_name из RESPONSE_CONFIG)."""
    model_config = RESPONSE_CONFIG

    id: int
    username: str
    display_name: str | None = None
    email: str | None = None
    role: Literal["admin", "reader"]
    created_at: str


class AdminUsersListResponse(BaseModel):
    """Response for GET /api/admin/users."""
    users: list[AdminUserResponse]


class AdminSettingsResponse(BaseModel):
    """Response for GET /api/admin/settings — camelCase wire, strict.

    forward-compat extra="allow" снят осознанно: новая настройка добавляется
    и в _ALLOWED_SETTINGS, и в поля этой модели.
    """
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel, extra="forbid")

    smtp_host: str | None = None
    smtp_port: str | None = None
    smtp_user: str | None = None
    smtp_pass: str | None = None
