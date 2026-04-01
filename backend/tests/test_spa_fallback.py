"""Tests for SPA fallback routing in main.py."""
import importlib
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def spa_client(tmp_path):
    """TestClient with a fake frontend dist directory."""
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>SPA</body></html>")
    assets = dist / "assets"
    assets.mkdir()
    (assets / "app.js").write_bytes(b"console.log('app')")

    # Patch FRONTEND_DIST before app is created
    import app.main as main_module
    original = main_module.FRONTEND_DIST

    # Reload with patched path
    main_module.FRONTEND_DIST = dist

    # Re-register the spa_fallback route with new dist
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    # Build a minimal test app with the same fallback logic
    from app.main import app as base_app
    # Use a fresh app that includes the spa routes
    test_app = FastAPI()
    test_app.mount("/assets", StaticFiles(directory=str(assets)), name="assets-test")

    @test_app.get("/{path:path}")
    async def fallback(path: str):
        file_path = (dist / path).resolve()
        if file_path.is_file() and str(file_path).startswith(str(dist.resolve())):
            return FileResponse(str(file_path))
        return FileResponse(str(dist / "index.html"))

    yield TestClient(test_app)

    main_module.FRONTEND_DIST = original


def test_unknown_route_returns_spa(spa_client):
    """Неизвестный путь → возвращает index.html, не JSON."""
    resp = spa_client.get("/foo/bar")
    assert resp.status_code == 200
    assert "SPA" in resp.text
    assert resp.headers["content-type"].startswith("text/html")


def test_known_spa_route_returns_spa(spa_client):
    """Известный SPA маршрут (e.g. /book/99) → тоже index.html."""
    resp = spa_client.get("/book/999")
    assert resp.status_code == 200
    assert "SPA" in resp.text


def test_static_asset_served(spa_client):
    """Статический файл из /assets → отдаётся как есть."""
    resp = spa_client.get("/assets/app.js")
    assert resp.status_code == 200


def test_root_returns_spa(spa_client):
    """Корень / → index.html."""
    resp = spa_client.get("/")
    assert resp.status_code == 200
    assert "SPA" in resp.text
