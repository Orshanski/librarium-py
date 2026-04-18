"""FastAPI exception handlers для custom domain exceptions.

Регистрируется через register_error_handlers(app) в main.py.
Response body: {"detail": str(exc)} — консистентно с E1 формой.

Handler'ы зарегистрированы на custom типы, не на builtin — случайный
`raise ValueError(...)` не попадает в 400-handler, уходит в generic 500.
См. regression-proof тесты в test_error_handlers.py::TestHandlerIsolation.
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .exceptions import (
    AuthError, BadInputError, ConflictError, ForbiddenError,
    NotFoundError, RateLimitError, UpstreamError,
)


async def _bad_input(request: Request, exc: BadInputError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


async def _not_found(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


async def _conflict(request: Request, exc: ConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


async def _forbidden(request: Request, exc: ForbiddenError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": str(exc)})


async def _auth(request: Request, exc: AuthError) -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": str(exc)})


async def _rate_limit(request: Request, exc: RateLimitError) -> JSONResponse:
    return JSONResponse(status_code=429, content={"detail": str(exc)})


async def _upstream(request: Request, exc: UpstreamError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": str(exc)})


def register_error_handlers(app: FastAPI) -> None:
    """Register canonical domain exception handlers on the given app."""
    app.add_exception_handler(BadInputError, _bad_input)
    app.add_exception_handler(NotFoundError, _not_found)
    app.add_exception_handler(ConflictError, _conflict)
    app.add_exception_handler(ForbiddenError, _forbidden)
    app.add_exception_handler(AuthError, _auth)
    app.add_exception_handler(RateLimitError, _rate_limit)
    app.add_exception_handler(UpstreamError, _upstream)
