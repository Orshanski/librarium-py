"""Shared Pydantic v2 Annotated types для router-level validation.

Reusable types для тех случаев, когда один pattern/constraint используется
в нескольких endpoint'ах (query/path/body). Держать здесь, чтобы не
дублировать regex/constraints и ловить drift.
"""
from typing import Annotated

from pydantic import StringConstraints


TempIdStr = Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9]{1,20}$')]
"""Temp upload ID: 1-20 alphanumeric chars. Используется в upload/covers
path params и upload CreateBookBody/AddFormatBody."""


NonBlankStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
"""Non-blank string: strip whitespace + require ≥1 non-blank char.
Используется для required query params (format, etc.)."""
