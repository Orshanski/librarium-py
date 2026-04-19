"""Upload request DTOs."""
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

TempIdStr = Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9]{1,20}$')]
"""Temp upload ID: 1-20 alphanumeric chars."""


class CreateBookMetadata(BaseModel):
    title: str
    authors: str = ""
    series: str = ""
    seriesNumber: str = ""
    description: str = ""
    language: str = ""
    tags: str = ""
    publisher: str = ""
    pubDate: str = ""
    isbn: str = ""
    coverUrl: str | None = None


class CreateBookBody(BaseModel):
    tempId: TempIdStr
    metadata: CreateBookMetadata = Field(default_factory=CreateBookMetadata)


class AddFormatBody(BaseModel):
    tempId: TempIdStr
