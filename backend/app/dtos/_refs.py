"""Ссылочные объекты для авторов, тегов, серий — единый BaseModel
для DAL-выдачи (через TypeAdapter) и провода (внутри ответных моделей).
Поля id/name дружественны camelCase, alias-конвертация не требуется."""
from pydantic import BaseModel


class AuthorRef(BaseModel):
    id: int
    name: str


class TagRef(BaseModel):
    id: int
    name: str


class SeriesRef(BaseModel):
    id: int
    name: str
