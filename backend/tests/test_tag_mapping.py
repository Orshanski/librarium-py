"""Tests for tag mapping (raw genre codes → tags)."""


class TestResolveRawTag:
    def test_known_mapping(self, admin_client):
        """sf_fantasy замаплен на тег 1 (Фэнтези) в seed."""
        from app.dal.tags import resolve_raw_tag
        tag_id = resolve_raw_tag("sf_fantasy")
        assert tag_id == 1

    def test_unknown_creates_tag_and_mapping(self, admin_client):
        """Неизвестный raw_tag создаёт тег и маппинг на себя."""
        from app.dal.tags import resolve_raw_tag
        from app.database import get_db
        tag_id = resolve_raw_tag("brand_new_genre")
        assert tag_id is not None
        db = get_db()
        tag = db.execute("SELECT name FROM tags WHERE id = ?", (tag_id,)).fetchone()
        assert tag["name"] == "brand_new_genre"
        mapping = db.execute("SELECT tag_id FROM tag_mappings WHERE raw_tag = ?", ("brand_new_genre",)).fetchone()
        assert mapping["tag_id"] == tag_id

    def test_case_insensitive(self, admin_client):
        """Маппинг case-insensitive."""
        from app.dal.tags import resolve_raw_tag
        tag_id = resolve_raw_tag("SF_Fantasy")
        assert tag_id == 1


class TestResolveTagNames:
    def test_known_tags(self, admin_client):
        from app.dal.tags import resolve_tag_names
        names = resolve_tag_names(["sf_fantasy", "det_classic"])
        assert names == ["Фэнтези", "Классический детектив"]

    def test_unknown_tag_passthrough(self, admin_client):
        from app.dal.tags import resolve_tag_names
        names = resolve_tag_names(["unknown_xyz"])
        assert names == ["unknown_xyz"]

    def test_empty_list(self, admin_client):
        from app.dal.tags import resolve_tag_names
        assert resolve_tag_names([]) == []


class TestMapTag:
    def test_rename_to_new_name(self, admin_client):
        """Сопоставление с новым именем → переименование."""
        from app.dal.tags import map_tag
        from app.database import get_db
        result = map_tag(tag_id=1, target_name="Новое Фэнтези")
        assert result["renamed"] is True
        assert result["target_id"] == 1
        db = get_db()
        tag = db.execute("SELECT name FROM tags WHERE id = 1").fetchone()
        assert tag["name"] == "Новое Фэнтези"

    def test_merge_into_existing(self, admin_client):
        """Сопоставление с существующим тегом → мерж."""
        from app.dal.tags import map_tag
        from app.database import get_db
        db = get_db()
        result = map_tag(tag_id=1, target_name="Классический детектив")
        assert result["renamed"] is False
        assert result["target_id"] == 2
        rows = db.execute("SELECT book_id FROM book_tags WHERE tag_id = 2 ORDER BY book_id").fetchall()
        book_ids = {r["book_id"] for r in rows}
        assert 1 in book_ids
        assert 4 in book_ids
        assert db.execute("SELECT id FROM tags WHERE id = 1").fetchone() is None
        m = db.execute("SELECT tag_id FROM tag_mappings WHERE raw_tag = 'sf_fantasy'").fetchone()
        assert m["tag_id"] == 2

    def test_merge_self_noop(self, admin_client):
        """Сопоставление с собой → noop."""
        from app.dal.tags import map_tag
        result = map_tag(tag_id=1, target_name="Фэнтези")
        assert result["renamed"] is True
        assert result["target_id"] == 1


class TestMapTagEndpoint:
    def test_rename(self, admin_client):
        resp = admin_client.put("/api/tags/1/map", json={"name": "Новое Фэнтези"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["targetId"] == 1

    def test_merge(self, admin_client):
        resp = admin_client.put("/api/tags/1/map", json={"name": "Классический детектив"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["targetId"] == 2

    def test_reader_forbidden(self, reader_client):
        resp = reader_client.put("/api/tags/1/map", json={"name": "Whatever"})
        assert resp.status_code == 403

    def test_not_found(self, admin_client):
        resp = admin_client.put("/api/tags/999/map", json={"name": "Whatever"})
        assert resp.status_code == 404

    def test_empty_name(self, admin_client):
        resp = admin_client.put("/api/tags/1/map", json={"name": "  "})
        assert resp.status_code == 400
