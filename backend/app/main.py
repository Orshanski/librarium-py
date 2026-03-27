from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from .routers import auth as auth_router
from .routers import books as books_router
from .routers import covers as covers_router
from .routers import download as download_router
from .routers import authors as authors_router
from .routers import series as series_router
from .routers import tags as tags_router
from .routers import shelves as shelves_router
from .routers import search as search_router
from .routers import options as options_router
from .routers import admin as admin_router
from .routers import user_books as user_books_router
from .routers import metadata as metadata_router
from .routers import upload as upload_router

app = FastAPI(title="Librarium", docs_url=None, redoc_url=None)

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
app.include_router(options_router.router)
app.include_router(admin_router.router)
app.include_router(user_books_router.router)
app.include_router(metadata_router.router)
app.include_router(upload_router.router)

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
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
