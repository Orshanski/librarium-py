"""Общие FS-утилиты с автоматическим rollback через context managers."""
from contextlib import contextmanager
import os
import shutil
from pathlib import Path
from typing import Iterable, Iterator, Union

from .exceptions import BadInputError


def assert_within(base: Union[str, Path], candidate: Union[str, Path]) -> str:
    """Гарантировать что `candidate` после resolve() остаётся внутри `base`.

    Защита от path-traversal: даже если в build'е пути затесался '../', '/',
    symlink или другой escape — этот guard поднимет BadInputError до того,
    как путь дойдёт до open/read/write/remove.

    Возвращает абсолютный resolved-путь как str.
    """
    base_resolved = Path(base).resolve()
    candidate_resolved = Path(candidate).resolve()
    try:
        candidate_resolved.relative_to(base_resolved)
    except ValueError as exc:
        raise BadInputError(f"Path escapes allowed root: {candidate}") from exc
    return str(candidate_resolved)


def safe_extension(filename: str, allowed: Iterable[str], default: str | None = None) -> str:
    """Извлечь расширение из user-controlled filename, проверить против whitelist.

    Защищает от path-traversal: rsplit('.', 1) даёт строку после последней точки,
    но в filename `a.b/c` это будет `b/c` — со слешем, который позже разъедет
    `os.path.join(dir, f'book.{ext}')` за пределы dir. Эта функция режет ext в
    нижний регистр и принимает только whitelisted значения.

    Если расширение не в whitelist:
      - default не None → вернуть default
      - default None → raise BadInputError
    """
    parts = (filename or "").rsplit(".", 1)
    ext = parts[-1].lower() if len(parts) == 2 else ""
    allowed_set = {a.lower() for a in allowed}
    if ext in allowed_set:
        return ext
    if default is not None and default.lower() in allowed_set:
        return default.lower()
    raise BadInputError(f"Unsupported file extension: {ext or '(empty)'}")


@contextmanager
def move_with_rollback(src: str, dst: str) -> Iterator[str]:
    """Переместить файл src → dst. При exception внутри with-блока удалить dst.

    Использует shutil.move — работает cross-filesystem (fallback copy+delete),
    в отличие от os.rename, который падает с Invalid cross-device link.
    """
    # Если move сам бросает — exception пробрасывается наверх без rollback:
    # dst не создан, откатывать нечего.
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
