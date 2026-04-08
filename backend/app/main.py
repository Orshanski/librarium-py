import logging
import os
import traceback

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path

from .auth import create_token
from .config import COOKIE_NAME, JWT_EXPIRE_HOURS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

from .routers import auth as auth_router
from .routers import books as books_router
from .routers import covers as covers_router
from .routers import download as download_router
from .routers import authors as authors_router
from .routers import series as series_router
from .routers import tags as tags_router
from .routers import shelves as shelves_router
from .routers import search as search_router
from .routers import filter_options as filter_options_router
from .routers import publishers as publishers_router
from .routers import admin as admin_router
from .routers import user_books as user_books_router
from .routers import metadata as metadata_router
from .routers import upload as upload_router
from .routers import similar as similar_router
from .routers import reader as reader_router

app = FastAPI(
    title="Librarium",
    docs_url=None,
    redoc_url=None,
)

_log = logging.getLogger("librarium")
_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_CSRF_HEADER = "X-Requested-With"
_CSRF_HEADER_VALUE = "XMLHttpRequest"


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    _log.error("Unhandled exception on %s %s: %s\n%s", request.method, request.url.path, exc, traceback.format_exc())
    return JSONResponse({"error": "Internal server error"}, status_code=500)


@app.middleware("http")
async def csrf_header_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method not in _CSRF_SAFE_METHODS:
        if request.headers.get(_CSRF_HEADER) != _CSRF_HEADER_VALUE:
            return JSONResponse({"error": "Missing required CSRF header"}, status_code=403)
    response = await call_next(request)
    if (getattr(request.state, "_refresh_token", False)
            and hasattr(request.state, "_refresh_user_id")
            and hasattr(request.state, "_refresh_role")
            and 200 <= response.status_code < 400):
        token = create_token(request.state._refresh_user_id, request.state._refresh_role)
        response.set_cookie(
            COOKIE_NAME,
            token,
            httponly=True,
            samesite="lax",
            secure=os.environ.get("SECURE_COOKIE", "").lower() in ("1", "true"),
            max_age=JWT_EXPIRE_HOURS * 3600,
            path="/",
        )
    return response


# Routers
app.include_router(auth_router.router)
app.include_router(books_router.router)
app.include_router(covers_router.router)
app.include_router(download_router.router)
app.include_router(authors_router.router)
app.include_router(series_router.router)
app.include_router(tags_router.router)
app.include_router(shelves_router.router)
app.include_router(search_router.router)
app.include_router(filter_options_router.router)
app.include_router(publishers_router.router)
app.include_router(admin_router.router)
app.include_router(user_books_router.router)
app.include_router(metadata_router.router)
app.include_router(upload_router.router)
app.include_router(similar_router.router)
app.include_router(reader_router.router)

# Static files (Vite build) — added last so API routes take priority
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@app.get("/api/health")
def health():
    return {"ok": True}


# SPA fallback — must be after all API routes
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        file_path = (FRONTEND_DIST / path).resolve()
        if file_path.is_file() and str(file_path).startswith(str(FRONTEND_DIST.resolve())):
            response = FileResponse(str(file_path))
            if path == "version.txt":
                response.headers["Cache-Control"] = "no-store"
            return response

        return FileResponse(str(FRONTEND_DIST / "index.html"))
