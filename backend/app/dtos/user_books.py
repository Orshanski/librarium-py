"""User-books request DTOs."""
from pydantic import BaseModel, Field


class RatingBody(BaseModel):
    rating: int | None = Field(None, ge=1, le=5)


class ReadBody(BaseModel):
    isRead: bool


class HiddenBody(BaseModel):
    isHidden: bool
