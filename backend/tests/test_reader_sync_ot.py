"""Operational transform sync and version tracking."""
from tests._helpers import assert_error, assert_ok


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
