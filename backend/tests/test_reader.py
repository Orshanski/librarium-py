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

    def test_settings_upsert(self, reader_client):
        reader_client.cookies.set("device_id", "device-upsert")
        reader_client.put("/api/reader/settings", json={"settings": {"theme": "dark"}})
        reader_client.put("/api/reader/settings", json={"settings": {"theme": "light", "zoom": 120}})
        data = reader_client.get("/api/reader/settings").json()
        assert data["settings"] == {"theme": "light", "zoom": 120}


class TestReadingProgress:
    def test_get_progress_empty(self, reader_client):
        resp = reader_client.get("/api/reader/progress/999")
        assert resp.status_code == 200
        data = resp.json()
        assert data["position"] is None
        assert data["last_device"] is None
        assert data["last_read_at"] is None
        # version is always present, even for empty state
        assert data["version"] == 0

    def test_save_and_get_progress(self, reader_client):
        put_resp = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "chapter-3/para-12", "last_device": "desktop", "expected_version": 0},
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
        assert data["last_device"] == "desktop"
        assert data["last_read_at"] is not None
        assert data["version"] == 1

    def test_progress_upsert_with_correct_expected_version(self, reader_client):
        r1 = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "chapter-1", "last_device": "desktop", "fraction": 0.1, "expected_version": 0},
        ).json()
        assert r1["accepted"] is True and r1["version"] == 1

        r2 = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "chapter-5", "last_device": "mobile", "fraction": 0.5, "expected_version": 1},
        ).json()
        assert r2["accepted"] is True and r2["version"] == 2 and r2["rebased"] is False

        data = reader_client.get("/api/reader/progress/1").json()
        assert data["position"] == "chapter-5"
        assert data["last_device"] == "mobile"
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

        client1.put("/api/reader/progress/1", json={"position": "chapter-3", "last_device": "desktop", "expected_version": 0})
        client2.put("/api/reader/progress/1", json={"position": "chapter-7", "last_device": "mobile", "expected_version": 0})

        reader_data = client1.get("/api/reader/progress/1").json()
        admin_data = client2.get("/api/reader/progress/1").json()

        assert reader_data["position"] == "chapter-3"
        assert admin_data["position"] == "chapter-7"

    def test_progress_require_auth_get(self, client):
        resp = client.get("/api/reader/progress/1")
        assert resp.status_code == 401

    def test_progress_require_auth_put(self, client):
        resp = client.put("/api/reader/progress/1", json={"position": "ch1", "last_device": "x"})
        assert resp.status_code == 401

    def test_fraction_too_high(self, reader_client):
        resp = reader_client.put("/api/reader/progress/1", json={
            "position": "ch1", "last_device": "x", "fraction": 1.5,
        })
        assert resp.status_code == 422

    def test_fraction_too_low(self, reader_client):
        resp = reader_client.put("/api/reader/progress/1", json={
            "position": "ch1", "last_device": "x", "fraction": -0.1,
        })
        assert resp.status_code == 422

    def test_last_format_saved(self, reader_client):
        reader_client.put("/api/reader/progress/1", json={
            "position": "ch1", "last_device": "desktop", "last_format": "EPUB", "fraction": 0.3, "expected_version": 0,
        })
        data = reader_client.get("/api/reader/progress/1").json()
        assert data["last_format"] == "EPUB"
        assert data["fraction"] == 0.3

    def test_progress_book_without_prior_progress(self, reader_client):
        """Book 3 exists but has no reading progress — save and read back."""
        data = reader_client.get("/api/reader/progress/3").json()
        assert data["position"] is None
        assert data["version"] == 0

        resp = reader_client.put("/api/reader/progress/3", json={
            "position": "ch1", "last_device": "test", "expected_version": 0,
        })
        assert resp.status_code == 200
        data = reader_client.get("/api/reader/progress/3").json()
        assert data["position"] == "ch1"
        assert data["version"] == 1

    def test_expected_version_defaults_to_zero(self, reader_client):
        """Body without expected_version should be treated as 0 (fresh write)."""
        resp = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "ch1", "last_device": "x", "fraction": 0.1},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] is True
        assert data["version"] == 1


class TestReadingProgressCAS:
    """CAS + intent-aware conflict resolution (DAL-level unit tests)."""

    def _get_reader_user_id(self, db):
        row = db.execute("SELECT id FROM users WHERE username = 'reader'").fetchone()
        return row["id"]

    def test_first_write_sets_version_1(self, db):
        from app.dal.reader import save_reading_progress
        uid = self._get_reader_user_id(db)

        result = save_reading_progress(
            db, uid, book_id=1,
            position="p1", last_device="d", last_format="EPUB",
            fraction=0.1, expected_version=0,
        )
        assert result["accepted"] is True
        assert result["version"] == 1
        assert result["rebased"] is False

    def test_matching_expected_accepts_and_increments(self, db):
        from app.dal.reader import save_reading_progress
        uid = self._get_reader_user_id(db)

        save_reading_progress(db, uid, 1, "p1", "d", "EPUB", 0.1, 0)
        result = save_reading_progress(db, uid, 1, "p2", "d", "EPUB", 0.2, 1)
        assert result["accepted"] is True
        assert result["version"] == 2
        assert result["rebased"] is False

    def test_wrong_expected_forward_rebases(self, db):
        """expected mismatch + new fraction >= current → rebase accept."""
        from app.dal.reader import save_reading_progress
        uid = self._get_reader_user_id(db)

        # Laptop writes v1 (from v0)
        save_reading_progress(db, uid, 1, "p_laptop", "laptop", "EPUB", 0.6, 0)

        # Phone (stale, still thinks expected=0) sends forward fraction → rebase
        result = save_reading_progress(db, uid, 1, "p_phone_ahead", "phone", "EPUB", 0.8, 0)
        assert result["accepted"] is True
        assert result["version"] == 2
        assert result["rebased"] is True

        # Server now has phone's forward position
        from app.dal.reader import get_reading_progress
        current = get_reading_progress(db, uid, 1)
        assert current["position"] == "p_phone_ahead"
        assert current["version"] == 2

    def test_wrong_expected_rewind_rejects(self, db):
        """expected mismatch + new fraction < current → reject, returns current."""
        from app.dal.reader import save_reading_progress
        uid = self._get_reader_user_id(db)

        # Laptop writes v1 with fraction 0.8
        save_reading_progress(db, uid, 1, "p_laptop_far", "laptop", "EPUB", 0.8, 0)

        # Phone tries to push a rewind (was stale at v0) → reject
        result = save_reading_progress(db, uid, 1, "p_phone_back", "phone", "EPUB", 0.25, 0)
        assert result["accepted"] is False
        assert result["current"] is not None
        assert result["current"]["position"] == "p_laptop_far"
        assert result["current"]["fraction"] == 0.8
        assert result["current"]["version"] == 1

        # Server state unchanged
        from app.dal.reader import get_reading_progress
        current = get_reading_progress(db, uid, 1)
        assert current["position"] == "p_laptop_far"
        assert current["version"] == 1

    def test_equal_fraction_counts_as_forward(self, db):
        """new == current (fraction) during conflict → treat as forward, rebase."""
        from app.dal.reader import save_reading_progress
        uid = self._get_reader_user_id(db)

        save_reading_progress(db, uid, 1, "p_a", "a", "EPUB", 0.5, 0)
        # Same fraction, different position, stale expected
        result = save_reading_progress(db, uid, 1, "p_b", "b", "EPUB", 0.5, 0)
        assert result["accepted"] is True
        assert result["rebased"] is True
        assert result["version"] == 2

    def test_null_current_fraction_treated_as_zero(self, db):
        """Legacy rows with fraction IS NULL should not block forward writes."""
        from app.dal.reader import save_reading_progress
        uid = self._get_reader_user_id(db)

        # Manually insert a row with NULL fraction (simulating legacy)
        db.execute(
            "INSERT INTO reading_progress (user_id, book_id, position, last_device, last_format, fraction, last_read_at, version) "
            "VALUES (:uid, :bid, 'legacy', 'old', 'EPUB', NULL, '2024-01-01', 5)",
            {"uid": uid, "bid": 1},
        )

        # New client pushes with stale expected (0) and any fraction → 0.1 >= 0 → forward rebase
        result = save_reading_progress(db, uid, 1, "p_new", "new", "EPUB", 0.1, 0)
        assert result["accepted"] is True
        assert result["rebased"] is True
        assert result["version"] == 6


class TestReadingProgressAPI:
    """API-level tests to cover wire format and router body parsing."""

    def test_put_progress_accepts_expected_version_body(self, reader_client):
        resp = reader_client.put(
            "/api/reader/progress/1",
            json={
                "position": "ch1", "last_device": "d", "last_format": "EPUB",
                "fraction": 0.1, "expected_version": 0,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] is True
        assert "version" in data
        assert "rebased" in data

    def test_put_progress_returns_current_on_reject(self, reader_client):
        """Rewind in conflict → accepted is False explicitly, current has version."""
        reader_client.put(
            "/api/reader/progress/1",
            json={"position": "far", "last_device": "d", "fraction": 0.8, "expected_version": 0},
        )
        resp = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "back", "last_device": "d", "fraction": 0.2, "expected_version": 0},
        )
        assert resp.status_code == 200
        data = resp.json()
        # Явно is False, не просто falsy
        assert data["accepted"] is False
        assert "current" in data
        assert "version" in data["current"]
        assert data["current"]["version"] == 1
        assert data["current"]["position"] == "far"

    def test_put_progress_returns_rebased_true_on_forward_conflict(self, reader_client):
        reader_client.put(
            "/api/reader/progress/1",
            json={"position": "p1", "last_device": "d", "fraction": 0.3, "expected_version": 0},
        )
        resp = reader_client.put(
            "/api/reader/progress/1",
            json={"position": "p2", "last_device": "d", "fraction": 0.6, "expected_version": 0},
        )
        data = resp.json()
        assert data["accepted"] is True
        assert data["rebased"] is True
        assert data["version"] == 2

    def test_get_progress_returns_version_field_for_populated_row(self, reader_client):
        reader_client.put(
            "/api/reader/progress/1",
            json={"position": "p1", "last_device": "d", "fraction": 0.3, "expected_version": 0},
        )
        data = reader_client.get("/api/reader/progress/1").json()
        assert "version" in data
        assert data["version"] == 1
