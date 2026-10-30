"""Каталог OPDS 2.0. Вход только по `Authorization: Bearer`, куки не принимаются и не ставятся."""
from typing import Annotated, Any
import hashlib
import sqlite3

from fastapi import APIRouter, Depends, Form, Query, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from starlette.datastructures import Headers
from starlette.staticfiles import NotModifiedResponse
from starlette.types import Receive, Scope, Send

from ..auth import CurrentUser, get_bearer_user, get_client_ip
from ..config import JWT_EXPIRE_HOURS
from ..database import db_session
from ..dtos.catalog import OpdsSort
from ..exceptions import AuthError, OpdsAuthRequired
from ..services import auth_service, opds_service
from ._file_responses import book_file_response, cover_response

router = APIRouter(prefix="/opds", tags=["opds"])


def opds_user(request: Request) -> CurrentUser:
    try:
        return get_bearer_user(request)
    except AuthError:
        raise OpdsAuthRequired()


User = Annotated[CurrentUser, Depends(opds_user)]
Db = Annotated[sqlite3.Connection, Depends(db_session)]
Page = Annotated[int, Query(ge=1)]


class FeedResponse(JSONResponse):
    """Лента с пометкой версии: повтор с той же пометкой получает 304 без тела.
    `no-cache` — каждый показ всё равно доходит до сервера и проверяет вход."""
    media_type = opds_service.FEED_TYPE

    def __init__(self, content: Any) -> None:
        super().__init__(content, headers={"Cache-Control": "private, no-cache"})
        self.headers["ETag"] = f'"{hashlib.sha256(self.body).hexdigest()}"'

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Сравнение пометок — как у StaticFiles.is_not_modified: прокси со сжатием отдаёт её как W/"…"
        if_none_match = Headers(scope=scope).get("if-none-match", "")
        if self.headers["etag"] in [tag.strip().removeprefix("W/") for tag in if_none_match.split(",")]:
            await NotModifiedResponse(self.headers)(scope, receive, send)
        else:
            await super().__call__(scope, receive, send)


def _token_error(error: str) -> JSONResponse:
    return JSONResponse({"error": error}, status_code=400,
                        headers={"Cache-Control": "no-store", "Pragma": "no-cache"})


@router.get("/auth", name="opds_auth_document")
def auth_document(request: Request) -> JSONResponse:
    return JSONResponse(
        opds_service.auth_document(str(request.url_for("opds_auth_document"))),
        media_type=opds_service.AUTH_DOCUMENT_TYPE,
    )


@router.post("/token")
def issue_token(
    request: Request,
    db: Db,
    grant_type: Annotated[str | None, Form()] = None,
    username: Annotated[str | None, Form()] = None,
    password: Annotated[str | None, Form()] = None,
) -> JSONResponse:
    """Выдача токена по паролю владельца (RFC 6749 §4.3) поверх входа сайта."""
    if grant_type is None or username is None or password is None:
        return _token_error("invalid_request")
    if grant_type != "password":
        return _token_error("unsupported_grant_type")
    try:
        token, _ = auth_service.login(db, username, password, get_client_ip(request))
    except AuthError:
        return _token_error("invalid_grant")
    return JSONResponse(
        {"access_token": token, "token_type": "bearer", "expires_in": JWT_EXPIRE_HOURS * 3600},
        headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
    )


@router.get("", include_in_schema=False)
def root_without_slash(request: Request) -> RedirectResponse:
    """Адрес без слеша иначе перехватил бы обработчик адресов SPA."""
    return RedirectResponse(request.url_for("opds_root").path)


@router.get("/", name="opds_root", response_class=FeedResponse)
def root(user: User) -> FeedResponse:
    return FeedResponse(opds_service.root_feed())


@router.get("/books", response_class=FeedResponse)
def books(
    user: User,
    db: Db,
    sort: OpdsSort = "addedDesc",
    author: int | None = None,
    series: int | None = None,
    genre: int | None = None,
    language: str | None = None,
    page: Page = 1,
) -> FeedResponse:
    return FeedResponse(opds_service.books_feed(
        db, user.user_id, sort, author, series, genre, language or None, page,
    ))


@router.get("/authors", response_class=FeedResponse)
def authors(user: User, db: Db) -> FeedResponse:
    return FeedResponse(opds_service.authors_feed(db, user.user_id))


@router.get("/authors/{author_id}", response_class=FeedResponse)
def author(author_id: int, user: User, db: Db) -> FeedResponse:
    return FeedResponse(opds_service.author_feed(db, user.user_id, author_id))


@router.get("/series", response_class=FeedResponse)
def series_list(user: User, db: Db) -> FeedResponse:
    return FeedResponse(opds_service.series_list_feed(db, user.user_id))


@router.get("/series/{series_id}", response_class=FeedResponse)
def series(series_id: int, user: User, db: Db) -> FeedResponse:
    return FeedResponse(opds_service.series_feed(db, user.user_id, series_id))


@router.get("/genres", response_class=FeedResponse)
def genres(user: User, db: Db) -> FeedResponse:
    return FeedResponse(opds_service.genres_feed(db))


@router.get("/genres/{tag_id}", response_class=FeedResponse)
def genre(tag_id: int, user: User, db: Db, page: Page = 1) -> FeedResponse:
    return FeedResponse(opds_service.genre_feed(db, user.user_id, tag_id, page))


@router.get("/search", response_class=FeedResponse)
def search(user: User, db: Db, query: str = "") -> FeedResponse:
    return FeedResponse(opds_service.search_feed(db, user.user_id, query))


@router.get("/books/{book_id}/download")
def download(book_id: int, format: str, user: User, db: Db) -> FileResponse:
    return book_file_response(db, book_id, format)


@router.get("/covers/{book_id}")
def cover(book_id: int, user: User, full: int = 0) -> FileResponse:
    # Адрес обложки в ленте несёт версию (?t=), замена обложки его меняет — хранить можно без срока
    return cover_response(book_id, full=bool(full), cache_control="public, max-age=31536000, immutable")
