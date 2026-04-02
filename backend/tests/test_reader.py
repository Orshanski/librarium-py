"""Tests for reader settings and reading progress API."""


class TestReaderSettings:
    def test_get_settings_empty(self, reader_client):
        resp = reader_client.get("/api/reader/settings", params={"device_type": "desktop"})
        assert resp.status_code == 200
        assert resp.json() == {"settings": {}}

    def test_save_and_get_settings(self, reader_client):
        payload = {"device_type": "desktop", "settings": {"font_size": 18, "theme": "dark"}}
        put_resp = reader_client.put("/api/reader/settings", json=payload)
        assert put_resp.status_code == 200
        assert put_resp.json() == {"ok": True}

        get_resp = reader_client.get("/api/reader/settings", params={"device_type": "desktop"})
        assert get_resp.status_code == 200
        assert get_resp.json() == {"settings": {"font_size": 18, "theme": "dark"}}

    def test_settings_isolated_by_device(self, reader_client):
        reader_client.put("/api/reader/settings", json={"device_type": "desktop", "settings": {"font_size": 18}})
        reader_client.put("/api/reader/settings", json={"device_type": "mobile", "settings": {"font_size": 14}})

        desktop = reader_client.get("/api/reader/settings", params={"device_type": "desktop"}).json()
        mobile = reader_client.get("/api/reader/settings", params={"device_type": "mobile"}).json()

        assert desktop["settings"]["font_size"] == 18
        assert mobile["settings"]["font_size"] == 14

    def test_settings_require_auth(self, client):
        resp = client.get("/api/reader/settings", params={"device_type": "desktop"})
        assert resp.status_code == 401


class TestReadingProgress:
    def test_get_progress_empty(self, reader_client):
        resp = reader_client.get("/api/reader/progress/999")
        assert resp.status_code == 200
        data = resp.json()
        assert data["position"] is None
        assert data["last_device"] is None
        assert data["last_read_at"] is None

    def test_save_and_get_progress(self, reader_client):
        put_resp = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "chapter-3/para-12", "last_device": "desktop"},
        )
        assert put_resp.status_code == 200
        assert put_resp.json() == {"ok": True}

        get_resp = reader_client.get("/api/reader/progress/1")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["position"] == "chapter-3/para-12"
        assert data["last_device"] == "desktop"
        assert data["last_read_at"] is not None

    def test_progress_upsert(self, reader_client):
        reader_client.put("/api/reader/progress/1", json={"position": "chapter-1", "last_device": "desktop"})
        reader_client.put("/api/reader/progress/1", json={"position": "chapter-5", "last_device": "mobile"})

        data = reader_client.get("/api/reader/progress/1").json()
        assert data["position"] == "chapter-5"
        assert data["last_device"] == "mobile"

    def test_progress_isolated_by_user(self):
        from starlette.testclient import TestClient
        from app.main import app

        client1 = TestClient(app)
        client2 = TestClient(app)

        resp = client1.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
        assert resp.status_code == 200

        resp = client2.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        assert resp.status_code == 200

        client1.put("/api/reader/progress/1", json={"position": "chapter-3", "last_device": "desktop"})
        client2.put("/api/reader/progress/1", json={"position": "chapter-7", "last_device": "mobile"})

        reader_data = client1.get("/api/reader/progress/1").json()
        admin_data = client2.get("/api/reader/progress/1").json()

        assert reader_data["position"] == "chapter-3"
        assert admin_data["position"] == "chapter-7"
