"""Shelves request DTOs."""
from pydantic import BaseModel


class ShelfBody(BaseModel):
    name: str


class ShelfBookBody(BaseModel):
    bookId: int
