"""Shared Pydantic v2 Annotated types для router-level validation.

Reusable types для тех случаев, когда один pattern/constraint используется
в нескольких endpoint'ах (query/path/body). Держать здесь, чтобы не
дублировать regex/constraints и ловить drift.
"""
from typing import Annotated

from pydantic import StringConstraints

from ..dtos.upload import TempIdStr  # canonical definition; re-exported for router imports
"""Temp upload ID: 1-20 alphanumeric chars. Используется в upload/covers
path params и upload CreateBookBody/AddFormatBody."""


NonBlankStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
"""Non-blank string: strip whitespace + require ≥1 non-blank char.
Используется для required query params (format, etc.)."""


__all__ = ["TempIdStr", "NonBlankStr"]
