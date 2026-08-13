"""Хранение структуры рекапа у книги — по образцу обложки."""
import json
import os
import sqlite3
import uuid

from ..config import LIBRARY_DIR, MAX_RECAP_SIZE
from ..dal import books as books_dal
from ..dtos.recap import RECAP_FORMAT_VERSION
from ..exceptions import BadInputError, NotFoundError

RECAP_FILENAME = "recap.json"
_TEMP_PREFIX = "recap.tmp."
_LIBRARY_ROOT = os.path.realpath(str(LIBRARY_DIR))
_LIBRARY_ROOT_PREFIX = _LIBRARY_ROOT + os.sep


def _book_dir(book_id: int) -> str:
    path = os.path.normpath(os.path.join(_LIBRARY_ROOT, str(int(book_id))))
    if not path.startswith(_LIBRARY_ROOT_PREFIX):
        raise BadInputError(f"Path escapes allowed root: {path}")
    return path


def recap_path(book_id: int) -> str:
    return os.path.join(_book_dir(book_id), RECAP_FILENAME)


def has_recap(book_id: int) -> bool:
    return os.path.isfile(recap_path(book_id))


def save_recap(db: sqlite3.Connection, book_id: int, document: dict) -> None:
    """Записать документ к книге и подвинуть время изменения книги."""
    if document.get("version") != RECAP_FORMAT_VERSION:
        raise BadInputError("Неизвестная версия формата рекапа")
    if int(document.get("bookId", -1)) != int(book_id):
        raise BadInputError("Номер книги в документе не совпадает с адресом")
    if not (document.get("recap") or {}).get("sections"):
        raise BadInputError("В документе нет разделов рекапа")
    if not (document.get("retell") or {}).get("parts"):
        raise BadInputError("В документе нет частей пересказа")
    if not books_dal.book_exists(db, book_id):
        raise NotFoundError("Книга не найдена")

    body = json.dumps(document, ensure_ascii=False)
    if len(body.encode("utf-8")) > MAX_RECAP_SIZE:
        raise BadInputError("Документ рекапа слишком большой")

    book_dir = _book_dir(book_id)
    os.makedirs(book_dir, exist_ok=True)
    temp = os.path.normpath(os.path.join(book_dir, f"{_TEMP_PREFIX}{uuid.uuid4().hex}"))
    target = os.path.normpath(os.path.join(book_dir, RECAP_FILENAME))
    # Барьер повторяется inline у каждого места записи: через helper статический
    # анализ его не признаёт (backend/CLAUDE.md), образец — book_service.py:178-180.
    if not temp.startswith(_LIBRARY_ROOT_PREFIX):
        raise BadInputError(f"Path escapes allowed root: {temp}")
    if not target.startswith(_LIBRARY_ROOT_PREFIX):
        raise BadInputError(f"Path escapes allowed root: {target}")
    try:
        with open(temp, "w", encoding="utf-8") as f:
            f.write(body)
        os.replace(temp, target)
    except Exception:
        if os.path.exists(temp) and temp.startswith(_LIBRARY_ROOT_PREFIX):
            os.remove(temp)
        raise

    books_dal.touch_book(db, book_id)
