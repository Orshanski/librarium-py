"""Оболочка документа рекапа. Внутренность разделов не типизируется намеренно:
приём не знает видов разделов, иначе он отвергал бы каждый новый вид."""
from typing import Any

from pydantic import BaseModel

from ._aliases import BODY_CONFIG

RECAP_FORMAT_VERSION = 1


class RecapDocument(BaseModel):
    model_config = BODY_CONFIG

    version: int
    book_id: int
    book: dict[str, Any]
    recap: dict[str, Any]
    retell: dict[str, Any]
