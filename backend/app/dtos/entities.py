"""Entity (authors, series, tags) request DTOs."""
from pydantic import BaseModel, ConfigDict, Field


class RenameBody(BaseModel):
    name: str


class MergeBody(BaseModel):
    sourceId: int


class MapBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(..., min_length=1)
