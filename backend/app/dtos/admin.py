"""Admin request DTOs and write-input TypedDicts."""
from typing import Literal, TypedDict

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
