"""Tests for tags rename/merge/delete endpoints (52az.1).

Старый /map endpoint и его тесты — в test_tag_mapping.py (без изменений
до удаления /map финальным коммитом ay83).

События проверяются через captured_domain_events fixture (поднята в
conftest.py, format: {scope, event:{type, payload}}).
"""
from tests._helpers import assert_error


def _event_matches(events, event_type, payload):
    return any(
        e["event"]["type"] == event_type and e["event"]["payload"] == payload
        for e in events
    )


class TestRenameTag:
    def test_rename_changes_name_and_publishes_event(self, admin_client, db, captured_domain_events):
        resp = admin_client.put("/api/tags/1", json={"name": "Новое фэнтези"})
        assert resp.status_code == 200
        row = db.execute("SELECT name FROM tags WHERE id = 1").fetchone()
        assert row["name"] == "Новое фэнтези"
        assert _event_matches(captured_domain_events, "tagRenamed", {"tagId": 1, "name": "Новое фэнтези"})

    def test_rename_normalizes_name(self, admin_client, db, captured_domain_events):
        # tag 1 seeded as "Фэнтези"; переименовываем в lowercase → ожидаем capitalize
        resp = admin_client.put("/api/tags/1", json={"name": "science fiction"})
        assert resp.status_code == 200
        row = db.execute("SELECT name FROM tags WHERE id = 1").fetchone()
        assert row["name"] == "Science fiction"
        # КРИТИЧНО: event payload содержит stored (post-normalize) name, не wire
        assert _event_matches(captured_domain_events, "tagRenamed", {"tagId": 1, "name": "Science fiction"})

    def test_rename_no_change_idempotent(self, admin_client, captured_domain_events):
        # tag 1 == 'Фэнтези' в seed
        resp = admin_client.put("/api/tags/1", json={"name": "Фэнтези"})
        assert resp.status_code == 200
        assert not any(e["event"]["type"] == "tagRenamed" for e in captured_domain_events)

    def test_rename_not_found(self, admin_client):
        assert_error(admin_client.put("/api/tags/99999", json={"name": "Whatever"}), 404)

    def test_rename_forbidden_for_reader(self, reader_client):
        assert_error(reader_client.put("/api/tags/1", json={"name": "Whatever"}), 403)

    def test_rename_empty_name_rejected(self, admin_client):
        resp = admin_client.put("/api/tags/1", json={"name": ""})
        assert resp.status_code == 422

    def test_rename_whitespace_only_name_rejected(self, admin_client):
        resp = admin_client.put("/api/tags/1", json={"name": "   "})
        assert resp.status_code == 422


class TestMergeTag:
    def test_merge_moves_books_and_publishes_event(self, admin_client, db, captured_domain_events):
        resp = admin_client.post("/api/tags/2/merge", json={"sourceId": 1})
        assert resp.status_code == 200
        # source книги перешли в target
        rows = db.execute("SELECT book_id FROM book_tags WHERE tag_id = 2 ORDER BY book_id").fetchall()
        book_ids = {r["book_id"] for r in rows}
        assert 1 in book_ids
        assert 4 in book_ids
        # source удалён
        assert db.execute("SELECT id FROM tags WHERE id = 1").fetchone() is None
        assert _event_matches(captured_domain_events, "tagMerged", {"targetId": 2, "sourceId": 1})

    def test_merge_self_merge_rejected(self, admin_client):
        assert_error(admin_client.post("/api/tags/1/merge", json={"sourceId": 1}), 400)

    def test_merge_nonexistent_source_no_event(self, admin_client, captured_domain_events):
        resp = admin_client.post("/api/tags/2/merge", json={"sourceId": 99999})
        assert resp.status_code == 200
        assert not any(e["event"]["type"] == "tagMerged" for e in captured_domain_events)

    def test_merge_forbidden_for_reader(self, reader_client):
        assert_error(reader_client.post("/api/tags/2/merge", json={"sourceId": 1}), 403)

    def test_merge_invalid_source_id_zero(self, admin_client):
        resp = admin_client.post("/api/tags/2/merge", json={"sourceId": 0})
        assert resp.status_code == 422

    def test_merge_invalid_source_id_negative(self, admin_client):
        resp = admin_client.post("/api/tags/2/merge", json={"sourceId": -5})
        assert resp.status_code == 422


class TestDeleteTag:
    def test_delete_removes_tag_and_publishes_event(self, admin_client, db, captured_domain_events):
        db.execute("INSERT INTO tags (name) VALUES ('EmptyForDelete')")
        db.commit()  # commit нужен — API хитит другую connection через db_session
        tag_id = db.execute("SELECT id FROM tags WHERE name = 'EmptyForDelete'").fetchone()["id"]
        resp = admin_client.delete(f"/api/tags/{tag_id}")
        assert resp.status_code == 200
        assert db.execute("SELECT id FROM tags WHERE id = ?", (tag_id,)).fetchone() is None
        assert _event_matches(captured_domain_events, "tagDeleted", {"tagId": tag_id})

    def test_delete_cleans_tag_mappings(self, admin_client, db):
        db.execute("INSERT INTO tags (name) VALUES ('WithMapping')")
        tag_id = db.execute("SELECT id FROM tags WHERE name = 'WithMapping'").fetchone()["id"]
        db.execute("INSERT INTO tag_mappings (raw_tag, tag_id) VALUES ('raw_tmp', ?)", (tag_id,))
        db.commit()
        admin_client.delete(f"/api/tags/{tag_id}")
        assert db.execute("SELECT raw_tag FROM tag_mappings WHERE tag_id = ?", (tag_id,)).fetchone() is None

    def test_delete_rejects_tag_with_books(self, admin_client):
        # tag 1 has books в seed
        assert_error(admin_client.delete("/api/tags/1"), 400)

    def test_delete_not_found(self, admin_client):
        assert_error(admin_client.delete("/api/tags/99999"), 404)

    def test_delete_forbidden_for_reader(self, reader_client):
        assert_error(reader_client.delete("/api/tags/1"), 403)
