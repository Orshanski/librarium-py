"""Reader request DTOs."""
from typing import Any

from pydantic import BaseModel, Field


class ReaderSettingsBody(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)


class ReadingProgressBody(BaseModel):
    position: str
    last_device: str = ""
    last_format: str = ""
    fraction: float = Field(0, ge=0, le=1)
    expected_version: int = Field(0, ge=0)
