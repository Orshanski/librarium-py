"""Tests for reader settings and reading progress API."""


class TestReaderSettings:
    def test_get_settings_auto_generates_device_id(self, reader_client):
        """First request without device_id cookie → response sets device_id cookie."""
        resp = reader_client.get("/api/reader/settings")
        assert resp.status_code == 200
        assert resp.json() == {"settings": {}}
        # Should have set a device_id cookie
        assert "device_id" in resp.cookies

    def test_save_and_get_settings(self, reader_client):
        """Save settings → read back with same device_id cookie."""
        # First GET to get device_id cookie
        get_resp = reader_client.get("/api/reader/settings")
        device_id = get_resp.cookies.get("device_id")
        assert device_id

        payload = {"settings": {"font_size": 18, "theme": "dark"}}
        put_resp = reader_client.put("/api/reader/settings", json=payload)
        assert put_resp.status_code == 200
        assert put_resp.json() == {"ok": True}

        get_resp2 = reader_client.get("/api/reader/settings")
        assert get_resp2.status_code == 200
        assert get_resp2.json() == {"settings": {"font_size": 18, "theme": "dark"}}

    def test_settings_isolated_by_device(self, reader_client):
        """Different device_id cookies → different settings."""
        reader_client.cookies.set("device_id", "device-aaa")
        reader_client.put("/api/reader/settings", json={"settings": {"font_size": 18}})

        reader_client.cookies.set("device_id", "device-bbb")
        reader_client.put("/api/reader/settings", json={"settings": {"font_size": 14}})

        reader_client.cookies.set("device_id", "device-aaa")
        aaa = reader_client.get("/api/reader/settings").json()

        reader_client.cookies.set("device_id", "device-bbb")
        bbb = reader_client.get("/api/reader/settings").json()

        assert aaa["settings"]["font_size"] == 18
        assert bbb["settings"]["font_size"] == 14

    def test_settings_saved_with_device_id_a_not_visible_with_b(self, reader_client):
        """Settings saved with device A are not returned for device B."""
        reader_client.cookies.set("device_id", "device-xxx")
        reader_client.put("/api/reader/settings", json={"settings": {"theme": "light"}})

        reader_client.cookies.set("device_id", "device-yyy")
        resp = reader_client.get("/api/reader/settings")
        assert resp.json() == {"settings": {}}

    def test_settings_require_auth(self, client):
        resp = client.get("/api/reader/settings")
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
