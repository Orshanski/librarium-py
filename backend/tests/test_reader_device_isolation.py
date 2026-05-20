"""Per-device settings isolation."""
from tests._helpers import assert_error

# Stable UUIDs для разделения по device_id. Сервис принимает только валидные
# UUID в cookie (защита от cookie-injection); human-readable строки игнорятся
# и замещаются свежим UUID на стороне сервера.
DEV_A = "11111111-1111-4111-8111-111111111111"
DEV_B = "22222222-2222-4222-8222-222222222222"
DEV_X = "33333333-3333-4333-8333-333333333333"
DEV_Y = "44444444-4444-4444-8444-444444444444"
DEV_UPSERT = "55555555-5555-4555-8555-555555555555"


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
        reader_client.cookies.set("device_id", DEV_A)
        reader_client.put("/api/reader/settings", json={"settings": {"font_size": 18}})

        reader_client.cookies.set("device_id", DEV_B)
        reader_client.put("/api/reader/settings", json={"settings": {"font_size": 14}})

        reader_client.cookies.set("device_id", DEV_A)
        aaa = reader_client.get("/api/reader/settings").json()

        reader_client.cookies.set("device_id", DEV_B)
        bbb = reader_client.get("/api/reader/settings").json()

        assert aaa["settings"]["font_size"] == 18
        assert bbb["settings"]["font_size"] == 14

    def test_settings_saved_with_device_id_a_not_visible_with_b(self, reader_client):
        """Settings saved with device A are not returned for device B."""
        reader_client.cookies.set("device_id", DEV_X)
        reader_client.put("/api/reader/settings", json={"settings": {"theme": "light"}})

        reader_client.cookies.set("device_id", DEV_Y)
        resp = reader_client.get("/api/reader/settings")
        assert resp.json() == {"settings": {}}

    def test_settings_upsert(self, reader_client):
        reader_client.cookies.set("device_id", DEV_UPSERT)
        reader_client.put("/api/reader/settings", json={"settings": {"theme": "dark"}})
        reader_client.put("/api/reader/settings", json={"settings": {"theme": "light", "zoom": 120}})
        data = reader_client.get("/api/reader/settings").json()
        assert data["settings"] == {"theme": "light", "zoom": 120}
