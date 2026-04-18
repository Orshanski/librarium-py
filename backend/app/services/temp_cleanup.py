"""Lookup и чистка temp-артефактов по temp_id.

Leaf-модуль: импортирует только stdlib + app.config. upload_service и
routers/upload.py импортируют отсюда find_temp_file / find_temp_covers /
cleanup_temp_session.
"""
import os
import re
from contextlib import suppress

from ..config import UPLOADS_DIR


def find_temp_file(temp_id: str) -> str | None:
    """Найти temp-файл по точному совпадению: `{temp_id}.{ext}`."""
    pattern = re.compile(rf"^{re.escape(temp_id)}\.(\w+)$")
    for f in os.listdir(str(UPLOADS_DIR)):
        if pattern.match(f):
            return f
    return None


def find_temp_covers(temp_id: str) -> list[str]:
    """Найти temp-cover файлы: `{temp_id}-cover.{ext}`."""
    pattern = re.compile(rf"^{re.escape(temp_id)}-cover\.(\w+)$")
    return [f for f in os.listdir(str(UPLOADS_DIR)) if pattern.match(f)]


def cleanup_temp_session(temp_id: str) -> None:
    """Удалить все temp-артефакты сессии: `{temp_id}.{ext}` + `{temp_id}-cover.{ext}`.

    Идемпотентна: повторный вызов на уже очищенной сессии — no-op. Не
    потокобезопасна в смысле коллизии temp_id (8-char uuid, практически
    невозможно). `suppress(FileNotFoundError)` защищает от race между
    `find_*` и `os.remove`.
    """
    book_file = find_temp_file(temp_id)
    if book_file:
        with suppress(FileNotFoundError):
            os.remove(str(UPLOADS_DIR / book_file))
    for f in find_temp_covers(temp_id):
        with suppress(FileNotFoundError):
            os.remove(str(UPLOADS_DIR / f))
