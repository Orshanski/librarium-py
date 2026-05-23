"""Tests for SPA fallback routing in main.py."""
import importlib
import sys

import pytest
from fastapi.testclient import TestClient


def _load_main_with_frontend_dist(monkeypatch, frontend_dist):
    import app.storage_paths as storage_paths

    original = storage_paths._FRONTEND_DIST
    monkeypatch.setattr(storage_paths, "_FRONTEND_DIST", frontend_dist)

    if "app.main" in sys.modules:
        main_module = importlib.reload(sys.modules["app.main"])
    else:
        main_module = importlib.import_module("app.main")

    def restore_main():
        storage_paths._FRONTEND_DIST = original
        importlib.reload(main_module)

    return main_module, restore_main


@pytest.fixture()
def spa_client(tmp_path, monkeypatch):
    """TestClient with a fake frontend dist directory."""
    dist = tmp_path / "back"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>SPA</body></html>")
    assets = dist / "assets"
    assets.mkdir()
    (assets / "app.js").write_bytes(b"console.log('app')")
    backend_file = tmp_path / "backend" / "app" / "main.py"
    backend_file.parent.mkdir(parents=True)
    backend_file.write_text("BACKEND SHOULD NOT BE SERVED")

    main_module, restore_main = _load_main_with_frontend_dist(monkeypatch, dist)

    yield TestClient(main_module.app)

    restore_main()


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


def test_encoded_parent_traversal_does_not_serve_backend_file(spa_client):
    resp = spa_client.get("/%2e%2e/backend/app/main.py")
    assert resp.status_code == 200
    assert "SPA" in resp.text
    assert "BACKEND SHOULD NOT BE SERVED" not in resp.text


def test_root_returns_spa(spa_client):
    """Корень / → index.html."""
    resp = spa_client.get("/")
    assert resp.status_code == 200
    assert "SPA" in resp.text


def test_missing_frontend_dist_keeps_api_behavior(tmp_path, monkeypatch):
    missing_dist = tmp_path / "missing"
    main_module, restore_main = _load_main_with_frontend_dist(monkeypatch, missing_dist)

    try:
        client = TestClient(main_module.app)
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
    finally:
        restore_main()
