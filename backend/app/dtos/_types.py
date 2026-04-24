"""Общие Pydantic type aliases для DTO-модулей.

Нейтральный модуль — без импортов из других dtos/* — чтобы избежать
circular imports между `dtos/books.py` и `dtos/upload.py`.
"""
from typing import Annotated

from pydantic import StringConstraints

TempIdStr = Annotated[str, StringConstraints(pattern=r'^[a-zA-Z0-9]{1,20}$')]
"""Temp upload ID: 1-20 alphanumeric chars."""

FormatCode = Annotated[str, StringConstraints(pattern=r'^[A-Z0-9]{1,10}$')]
"""Upper-case book format code: FB2, EPUB, PDF, MOBI и т. п."""
