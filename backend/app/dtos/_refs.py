"""Reference объекты для авторов, тегов, серий — единый BaseModel
для DAL-output (через TypeAdapter) и wire (внутри response-моделей).
Поля id/name camelCase-friendly, alias-конвертация не требуется."""
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
