"""Helpers для записи формата книги в library-каталог.

Используется тремя call sites:
- book_service.upload_file (content из памяти)
- upload_service.add_format (файл из temp через shutil.move)
- upload_service.create_book (новая книга из temp + опционально cover)

Функции оставлены узкими: guards + path build, либо linearize + DAL. Rollback
FS-операций — ответственность caller'а (через fs_utils.move_with_rollback /
write_with_rollback).
"""
import os
import sqlite3

from ..config import LIBRARY_DIR, db_path_for
from ..dal import books as dal
from ..exceptions import ConflictError, NotFoundError
from ..pdf_linearize import linearize_pdf_in_place


def book_dir_and_dst(book_id: int, ext: str) -> tuple[str, str]:
    """Построить путь к каталогу книги и к файлу book.{ext}, создать каталог.

    Публичный helper: используется внутри prepare_book_format_path и в
    upload_service.create_book (книга новая, guards не нужны, но путь
    строится через единый helper).
    """
    book_dir = str(LIBRARY_DIR / str(book_id))
    os.makedirs(book_dir, exist_ok=True)
    dst = os.path.join(book_dir, f"book.{ext}")
    return book_dir, dst


def prepare_book_format_path(
    db: sqlite3.Connection, book_id: int, fmt: str, ext: str
) -> str:
    """Проверить существование книги и уникальность формата, создать каталог,
    вернуть dst-путь.

    Raises:
        NotFoundError: если книга не существует.
        ConflictError: если формат уже зарегистрирован у этой книги.
    """
    if not dal.book_exists(db, book_id):
        raise NotFoundError("Book not found")
    if dal.book_file_exists(db, book_id, fmt):
        raise ConflictError(f"Формат {fmt} уже есть")
    _, dst = book_dir_and_dst(book_id, ext)
    return dst


def register_and_linearize(
    db: sqlite3.Connection, book_id: int, dst: str, ext: str
) -> int:
    """Linearize если PDF, зарегистрировать в DAL, вернуть размер.

    Size измеряется ПОСЛЕ linearize — linearize_pdf_in_place меняет размер PDF,
    caller'у нужно актуальное значение.

    Без FS rollback: caller управляет откатом через fs_utils.move_with_rollback
    или write_with_rollback — при DAL-failure rollback сработает автоматически.
    """
    if ext == "pdf":
        linearize_pdf_in_place(dst)
    file_size = os.path.getsize(dst)
    dal.add_book_file(db, book_id, ext.upper(), db_path_for(book_id, f"book.{ext}"), file_size)
    return file_size
