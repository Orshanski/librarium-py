"""Reader progress read/write and basic sync."""
from tests._helpers import assert_error


class TestReadingProgress:
    def test_get_progress_empty(self, reader_client):
        resp = reader_client.get("/api/reader/progress/999")
        assert resp.status_code == 200
        data = resp.json()
        assert data["position"] is None
        assert data["lastDevice"] is None
        assert data["lastReadAt"] is None
        # version is always present, even for empty state
        assert data["version"] == 0

    def test_save_and_get_progress(self, reader_client):
        put_resp = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "chapter-3/para-12", "lastDevice": "desktop", "expectedVersion": 0},
        )
        assert put_resp.status_code == 200
        data = put_resp.json()
        assert data["accepted"] is True
        assert data["version"] == 1
        assert data["rebased"] is False

        get_resp = reader_client.get("/api/reader/progress/1")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["position"] == "chapter-3/para-12"
        assert data["lastDevice"] == "desktop"
        assert data["lastReadAt"] is not None
        assert data["version"] == 1

    def test_progress_upsert_with_correct_expected_version(self, reader_client):
        r1 = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "chapter-1", "lastDevice": "desktop", "fraction": 0.1, "expectedVersion": 0},
        ).json()
        assert r1["accepted"] is True and r1["version"] == 1

        r2 = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "chapter-5", "lastDevice": "mobile", "fraction": 0.5, "expectedVersion": 1},
        ).json()
        assert r2["accepted"] is True and r2["version"] == 2 and r2["rebased"] is False

        data = reader_client.get("/api/reader/progress/1").json()
        assert data["position"] == "chapter-5"
        assert data["lastDevice"] == "mobile"
        assert data["version"] == 2

    def test_progress_isolated_by_user(self):
        from starlette.testclient import TestClient
        from app.main import app

        client1 = TestClient(app)
        client2 = TestClient(app)
        client1.headers.update({"X-Requested-With": "XMLHttpRequest"})
        client2.headers.update({"X-Requested-With": "XMLHttpRequest"})

        resp = client1.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
        assert resp.status_code == 200

        resp = client2.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        assert resp.status_code == 200

        client1.put("/api/reader/progress/1", json={"position": "chapter-3", "lastDevice": "desktop", "expectedVersion": 0})
        client2.put("/api/reader/progress/1", json={"position": "chapter-7", "lastDevice": "mobile", "expectedVersion": 0})

        reader_data = client1.get("/api/reader/progress/1").json()
        admin_data = client2.get("/api/reader/progress/1").json()

        assert reader_data["position"] == "chapter-3"
        assert admin_data["position"] == "chapter-7"

    def test_fraction_too_high(self, reader_client):
        resp = reader_client.put("/api/reader/progress/1", json={
            "position": "ch1", "lastDevice": "x", "fraction": 1.5,
        })
        assert_error(resp, 422)

    def test_fraction_too_low(self, reader_client):
        resp = reader_client.put("/api/reader/progress/1", json={
            "position": "ch1", "lastDevice": "x", "fraction": -0.1,
        })
        assert_error(resp, 422)

    def test_last_format_saved(self, reader_client):
        reader_client.put("/api/reader/progress/1", json={
            "position": "ch1", "lastDevice": "desktop", "lastFormat": "EPUB", "fraction": 0.3, "expectedVersion": 0,
        })
        data = reader_client.get("/api/reader/progress/1").json()
        assert data["lastFormat"] == "EPUB"
        assert data["fraction"] == 0.3

    def test_progress_book_without_prior_progress(self, reader_client):
        """Book 3 exists but has no reading progress — save and read back."""
        data = reader_client.get("/api/reader/progress/3").json()
        assert data["position"] is None
        assert data["version"] == 0

        resp = reader_client.put("/api/reader/progress/3", json={
            "position": "ch1", "lastDevice": "test", "expectedVersion": 0,
        })
        assert resp.status_code == 200
        data = reader_client.get("/api/reader/progress/3").json()
        assert data["position"] == "ch1"
        assert data["version"] == 1

    def test_expected_version_defaults_to_zero(self, reader_client):
        """Body without expectedVersion should be treated as 0 (fresh write)."""
        resp = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "ch1", "lastDevice": "x", "fraction": 0.1},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] is True
        assert data["version"] == 1
