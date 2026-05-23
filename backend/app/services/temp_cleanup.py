"""Lookup и чистка temp-артефактов по temp_id.

Leaf-модуль: импортирует только stdlib + storage path policy. upload_service и
routers/upload.py импортируют отсюда find_temp_file / find_temp_covers /
cleanup_temp_session. Плюс lazy orphan-GC `cleanup_old_uploads`, который
зовут upload-пути в начале своей работы (self-healing без scheduler/cron).
"""
import logging
import time
from contextlib import suppress

from .. import storage_paths
from ..exceptions import BadInputError

log = logging.getLogger("librarium.services.temp_cleanup")

# Grace period для lazy orphan-GC: файлы старше этого возраста считаются
# осиротевшими и удаляются при следующем upload'е. Час — защита от гонок,
# когда два пользователя грузят параллельно: in-flight сессии первого не
# будут снесены upload'ом второго, если они моложе часа.
_GRACE_SECONDS = 3600


def find_temp_file(temp_id: str) -> str | None:
    """Найти temp-файл по точному совпадению: `{temp_id}.{ext}`."""
    try:
        for ext in sorted(storage_paths.BOOK_EXTS):
            path = storage_paths.upload_book_file(temp_id, ext)
            if path.is_file():
                return path.name
    except BadInputError:
        return None
    return None


def find_temp_covers(temp_id: str) -> list[str]:
    """Найти temp-cover файлы: `{temp_id}-cover.{ext}`."""
    try:
        paths = [
            storage_paths.upload_cover_file(temp_id, ext)
            for ext in sorted(storage_paths.COVER_EXTS)
        ]
    except BadInputError:
        return []
    return [path.name for path in paths if path.is_file()]


def cleanup_temp_session(temp_id: str) -> None:
    """Удалить все temp-артефакты сессии: `{temp_id}.{ext}` + `{temp_id}-cover.{ext}`.

    Идемпотентна: повторный вызов на уже очищенной сессии — no-op. Не
    потокобезопасна в смысле коллизии temp_id (8-char uuid, практически
    невозможно). `suppress(FileNotFoundError)` защищает от race между
    lookup и unlink.
    """
    try:
        paths = storage_paths.upload_session_files(temp_id)
    except BadInputError:
        return
    for path in paths:
        with suppress(FileNotFoundError):
            path.unlink()


def cleanup_old_uploads() -> int:
    """Удалить все файлы в UPLOADS_DIR старше _GRACE_SECONDS.

    Вызывается в начале каждого upload-пути (cover_service.upload_temp,
    upload_service.upload_and_parse) — self-healing GC, без scheduler/cron.
    Возвращает количество удалённых файлов; логирует только при >0.

    Идемпотентна и безопасна при параллельных вызовах: race между lookup и
    unlink гасится `suppress(FileNotFoundError)`. Directories не трогаем —
    UPLOADS_DIR плоский, только файлы.
    """
    cutoff = time.time() - _GRACE_SECONDS
    removed = 0
    for path in storage_paths.upload_policy_files():
        try:
            if path.stat().st_mtime < cutoff:
                with suppress(FileNotFoundError):
                    path.unlink()
                    removed += 1
        except OSError:
            # stat мог упасть если файл снесли параллельно — нестрашно.
            continue
    if removed > 0:
        log.info("Cleaned %d orphan upload(s) older than %ds", removed, _GRACE_SECONDS)
    return removed
