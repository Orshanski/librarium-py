"""Выдача файла книги и обложки — общая для сайта (`/api/`) и каталога OPDS (`/opds/`)."""
import sqlite3

from fastapi.responses import FileResponse

from ..services import cover_service, download_service


def book_file_response(db: sqlite3.Connection, book_id: int, fmt: str) -> FileResponse:
    target = download_service.resolve_download(db, book_id, fmt)
    return FileResponse(target.path, filename=target.filename, media_type=target.media_type)


def cover_response(book_id: int, *, full: bool) -> FileResponse:
    cover_path = cover_service.get_cover_path(book_id)
    headers = {"Cache-Control": "public, max-age=3600"}
    if full:
        return FileResponse(cover_path, headers=headers)
    thumb_path = cover_service.get_thumb(book_id, cover_path)
    if thumb_path is None:
        return FileResponse(cover_path, headers=headers)
    return FileResponse(thumb_path, media_type="image/jpeg", headers=headers)
