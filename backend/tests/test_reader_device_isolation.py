"""Per-device settings isolation."""
from tests._helpers import assert_error


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

    def test_settings_upsert(self, reader_client):
        reader_client.cookies.set("device_id", "device-upsert")
        reader_client.put("/api/reader/settings", json={"settings": {"theme": "dark"}})
        reader_client.put("/api/reader/settings", json={"settings": {"theme": "light", "zoom": 120}})
        data = reader_client.get("/api/reader/settings").json()
        assert data["settings"] == {"theme": "light", "zoom": 120}
