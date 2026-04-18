"""Общие FS-утилиты с автоматическим rollback через context managers."""
from contextlib import contextmanager
import os
import shutil
from typing import Iterator


@contextmanager
def move_with_rollback(src: str, dst: str) -> Iterator[str]:
    """Переместить файл src → dst. При exception внутри with-блока удалить dst.

    Использует shutil.move — работает cross-filesystem (fallback copy+delete),
    в отличие от os.rename, который падает с Invalid cross-device link.
    """
    shutil.move(src, dst)
    try:
        yield dst
    except Exception:
        if os.path.exists(dst):
            os.remove(dst)
        raise


@contextmanager
def write_with_rollback(path: str, content: bytes) -> Iterator[str]:
    """Записать content в path. При exception удалить path."""
    with open(path, "wb") as f:
        f.write(content)
    try:
        yield path
    except Exception:
        if os.path.exists(path):
            os.remove(path)
        raise
