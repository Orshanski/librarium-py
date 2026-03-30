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
