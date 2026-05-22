"""Tests for tag mapping (raw genre codes -> tags)."""
from tests._helpers import assert_error


class TestResolveRawTag:
    def test_known_mapping(self, admin_client, db):
        """sf_fantasy замаплен на тег 1 (Фэнтези) в seed."""
        from app.dal.tags import resolve_raw_tag
        tag_id = resolve_raw_tag(db, "sf_fantasy")
        assert tag_id == 1

    def test_unknown_creates_tag_with_capitalized_name(self, admin_client, db):
        """Неизвестный raw_tag создаёт тег с Capitalized name (write-инвариант tags.name)."""
        from app.dal.tags import resolve_raw_tag
        tag_id = resolve_raw_tag(db, "brand_new_genre")
        tag = db.execute("SELECT name FROM tags WHERE id = ?", (tag_id,)).fetchone()
        assert tag["name"] == "Brand_new_genre"

    def test_unknown_creates_self_mapping_with_raw_lowercase(self, admin_client, db):
        """Self-mapping сохраняет raw_tag дословно (lowercase FB2-код), не нормализует —
        семантика raw_tag = «как пришло от парсера»; lookup идёт через NOCASE."""
        from app.dal.tags import resolve_raw_tag
        tag_id = resolve_raw_tag(db, "brand_new_genre")
        mapping = db.execute("SELECT raw_tag, tag_id FROM tag_mappings WHERE tag_id = ?", (tag_id,)).fetchone()
        assert mapping["raw_tag"] == "brand_new_genre"
        assert mapping["tag_id"] == tag_id

    def test_case_insensitive(self, admin_client, db):
        """Маппинг case-insensitive."""
        from app.dal.tags import resolve_raw_tag
        tag_id = resolve_raw_tag(db, "SF_Fantasy")
        assert tag_id == 1


class TestResolveTagNames:
    def test_known_tags(self, admin_client, db):
        from app.dal.tags import resolve_tag_names
        names = resolve_tag_names(db, ["sf_fantasy", "det_classic"])
        assert names == ["Фэнтези", "Классический детектив"]

    def test_unknown_tag_passthrough_capitalized(self, admin_client, db):
        from app.dal.tags import resolve_tag_names
        names = resolve_tag_names(db, ["unknown_xyz"])
        assert names == ["Unknown_xyz"]

    def test_empty_list(self, admin_client, db):
        from app.dal.tags import resolve_tag_names
        assert resolve_tag_names(db, []) == []

    def test_all_caps_long_lowercased(self, admin_client, db):
        # Long ALL-CAPS tags get title-cased (>4 chars)
        from app.dal.tags import resolve_tag_names
        names = resolve_tag_names(db, ["SCIENCE FICTION"])
        assert names == ["Science fiction"]

    def test_acronyms_preserved(self, admin_client, db):
        # Short ALL-CAPS acronyms (<=4 chars) preserved
        from app.dal.tags import resolve_tag_names
        assert resolve_tag_names(db, ["AI"]) == ["AI"]
        assert resolve_tag_names(db, ["SQL"]) == ["SQL"]
        assert resolve_tag_names(db, ["HTTP"]) == ["HTTP"]

    def test_dedup_after_merge(self, admin_client, db):
        """Two raw codes mapped to same tag -> deduplicated in result."""
        from app.dal.tags import resolve_tag_names
        # Map a second raw code to tag 1 (Фэнтези)
        db.execute("INSERT INTO tag_mappings (raw_tag, tag_id) VALUES ('fantasy_alt', 1)")
        names = resolve_tag_names(db, ["sf_fantasy", "fantasy_alt"])
        assert names == ["Фэнтези"]


class TestGetOrCreateTagWriteCapitalization:
    """Write-path invariant: tag names always start with uppercase in `tags`,
    regardless of the caller (FB2/EPUB raw code, edit form, custom string)."""

    def test_lowercase_input_is_capitalized(self, admin_client, db):
        from app.dal.tags import get_or_create_tag
        tag_id = get_or_create_tag(db, "иные миры")
        row = db.execute("SELECT name FROM tags WHERE id = ?", (tag_id,)).fetchone()
        assert row["name"] == "Иные миры"

    def test_lowercase_input_finds_existing_capitalized(self, admin_client, db):
        from app.dal.tags import get_or_create_tag
        first_id = get_or_create_tag(db, "Иные миры")
        second_id = get_or_create_tag(db, "иные миры")
        assert first_id == second_id
        row = db.execute("SELECT name FROM tags WHERE id = ?", (first_id,)).fetchone()
        assert row["name"] == "Иные миры"
        # No lowercase duplicate slipped through.
        dup = db.execute("SELECT id FROM tags WHERE name = ?", ("иные миры",)).fetchone()
        assert dup is None

    def test_already_capitalized_unchanged(self, admin_client, db):
        from app.dal.tags import get_or_create_tag
        tag_id = get_or_create_tag(db, "Эпическое фэнтези")
        row = db.execute("SELECT name FROM tags WHERE id = ?", (tag_id,)).fetchone()
        assert row["name"] == "Эпическое фэнтези"

    def test_long_all_caps_lowercased_after_first(self, admin_client, db):
        from app.dal.tags import get_or_create_tag
        tag_id = get_or_create_tag(db, "SCIENCE FICTION")
        row = db.execute("SELECT name FROM tags WHERE id = ?", (tag_id,)).fetchone()
        assert row["name"] == "Science fiction"

    def test_short_acronym_preserved(self, admin_client, db):
        from app.dal.tags import get_or_create_tag
        tag_id = get_or_create_tag(db, "AI")
        row = db.execute("SELECT name FROM tags WHERE id = ?", (tag_id,)).fetchone()
        assert row["name"] == "AI"


class TestMapTag:
    def test_rename_to_new_name(self, admin_client, db):
        """Сопоставление с новым именем -> переименование."""
        from app.dal.tags import map_tag
        result = map_tag(db, tag_id=1, target_name="Новое Фэнтези")
        assert result["renamed"] is True
        assert result["target_id"] == 1
        tag = db.execute("SELECT name FROM tags WHERE id = 1").fetchone()
        assert tag["name"] == "Новое Фэнтези"

    def test_merge_into_existing(self, admin_client, db):
        """Сопоставление с существующим тегом -> мерж."""
        from app.dal.tags import map_tag
        result = map_tag(db, tag_id=1, target_name="Классический детектив")
        assert result["renamed"] is False
        assert result["target_id"] == 2
        rows = db.execute("SELECT book_id FROM book_tags WHERE tag_id = 2 ORDER BY book_id").fetchall()
        book_ids = {r["book_id"] for r in rows}
        assert 1 in book_ids
        assert 4 in book_ids
        assert db.execute("SELECT id FROM tags WHERE id = 1").fetchone() is None
        m = db.execute("SELECT tag_id FROM tag_mappings WHERE raw_tag = 'sf_fantasy'").fetchone()
        assert m["tag_id"] == 2

    def test_merge_self_noop(self, admin_client, db):
        """Сопоставление с собой -> noop."""
        from app.dal.tags import map_tag
        result = map_tag(db, tag_id=1, target_name="Фэнтези")
        assert result["renamed"] is True
        assert result["target_id"] == 1

    def test_rename_lowercase_target_capitalizes(self, admin_client, db):
        """Rename с lowercase именем нормализуется через _capitalize_tag —
        write-инвариант (tags.name всегда Capitalized) держится и на rename-path."""
        from app.dal.tags import map_tag
        result = map_tag(db, tag_id=1, target_name="новое фэнтези")
        assert result["renamed"] is True
        assert result["target_id"] == 1
        tag = db.execute("SELECT name FROM tags WHERE id = 1").fetchone()
        assert tag["name"] == "Новое фэнтези"

    def test_rename_lowercase_collides_with_capitalized_via_nocase(self, admin_client, db):
        """Rename "классический детектив" должен распознать коллизию
        с #2 "Классический детектив" (NOCASE) и пойти merge-веткой,
        а не simple rename — иначе UNIQUE-индекс или write-инвариант сломались бы."""
        from app.dal.tags import map_tag
        result = map_tag(db, tag_id=1, target_name="классический детектив")
        assert result["renamed"] is False
        assert result["target_id"] == 2
        assert db.execute("SELECT id FROM tags WHERE id = 1").fetchone() is None


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
        assert_error(reader_client.put("/api/tags/1/map", json={"name": "Whatever"}), 403)

    def test_not_found(self, admin_client):
        assert_error(admin_client.put("/api/tags/999/map", json={"name": "Whatever"}), 404)

    def test_empty_name(self, admin_client):
        """После T7: Pydantic str_strip_whitespace + min_length=1 даёт 422 на whitespace-only."""
        resp = admin_client.put("/api/tags/1/map", json={"name": "  "})
        assert resp.status_code == 422

    def test_blank_name_rejected(self, admin_client):
        """Пустая строка тоже 422 (Pydantic min_length=1 не зависит от strip)."""
        resp = admin_client.put("/api/tags/1/map", json={"name": ""})
        assert resp.status_code == 422


class TestUploadMapping:
    def test_upload_resolves_known_genre(self, admin_client):
        """Upload FB2 -> metadata tags содержит человекочитаемое имя."""
        from pathlib import Path
        fixtures = Path(__file__).parent / "fixtures" / "books"
        fb2_path = fixtures / "minimal.fb2"
        with open(fb2_path, "rb") as f:
            resp = admin_client.post("/api/upload", files={"file": ("test.fb2", f, "application/octet-stream")})
        assert resp.status_code == 200
        tags = resp.json()["metadata"]["tags"]
        assert "sf_fantasy" not in tags
        assert "Фэнтези" in tags


class TestRenameTagDAL:
    def test_rename_changes_name(self, admin_client, db):
        from app.dal.tags import rename_tag
        rename_tag(db, tag_id=1, name="Новое фэнтези")
        row = db.execute("SELECT name FROM tags WHERE id = 1").fetchone()
        assert row["name"] == "Новое фэнтези"

    def test_rename_does_not_affect_other_tags(self, admin_client, db):
        from app.dal.tags import rename_tag
        original_name_2 = db.execute("SELECT name FROM tags WHERE id = 2").fetchone()["name"]
        rename_tag(db, tag_id=1, name="Какое-то новое имя")
        new_name_2 = db.execute("SELECT name FROM tags WHERE id = 2").fetchone()["name"]
        assert new_name_2 == original_name_2


class TestMergeTagDAL:
    def test_merge_moves_books_from_source_to_target(self, admin_client, db):
        from app.dal.tags import merge_tag
        # Seed (tests/seed.py): tag 1 → books {1, 3, 5}; tag 2 → books {2, 4, 5}.
        # Book 5 уже в обоих тегах → INSERT OR IGNORE дедуплицирует
        # (book_tags has PRIMARY KEY (book_id, tag_id)).
        merge_tag(db, target_id=2, source_id=1)
        # All books that referenced tag 1 теперь reference tag 2
        rows = db.execute("SELECT book_id FROM book_tags WHERE tag_id = 2 ORDER BY book_id").fetchall()
        book_ids = {r["book_id"] for r in rows}
        assert {1, 2, 3, 4, 5} == book_ids

    def test_merge_deletes_source_tag(self, admin_client, db):
        from app.dal.tags import merge_tag
        merge_tag(db, target_id=2, source_id=1)
        assert db.execute("SELECT id FROM tags WHERE id = 1").fetchone() is None

    def test_merge_remaps_existing_tag_mappings(self, admin_client, db):
        """Phantom-исключение seed-зависимости: вставляем явный mapping для test,
        проверяем behavior merge_tag, а не seed-состояние."""
        from app.dal.tags import merge_tag
        # Setup explicit mapping (don't depend on seed mapping 'sf_fantasy' → 1)
        db.execute("INSERT INTO tag_mappings (raw_tag, tag_id) VALUES ('test_raw_remap', 1)")
        merge_tag(db, target_id=2, source_id=1)
        row = db.execute("SELECT tag_id FROM tag_mappings WHERE raw_tag = 'test_raw_remap'").fetchone()
        assert row is not None
        assert row["tag_id"] == 2

    def test_merge_inserts_source_name_mapping(self, admin_client, db):
        from app.dal.tags import merge_tag
        # Before merge: source name 'Фэнтези' (tag 1) — нет self-mapping by name.
        # After merge: 'Фэнтези' → target_id=2 в tag_mappings (future imports of
        # raw 'Фэнтези' разрешаются в merged target).
        merge_tag(db, target_id=2, source_id=1)
        row = db.execute("SELECT tag_id FROM tag_mappings WHERE raw_tag = 'Фэнтези'").fetchone()
        assert row is not None
        assert row["tag_id"] == 2


class TestDeleteTagDAL:
    def test_delete_removes_tag(self, admin_client, db):
        from app.dal.tags import delete_tag
        # Seed: создать тег без книг
        db.execute("INSERT INTO tags (name) VALUES ('TempForDeleteTest')")
        tag_id = db.execute("SELECT id FROM tags WHERE name = 'TempForDeleteTest'").fetchone()["id"]
        delete_tag(db, tag_id=tag_id)
        assert db.execute("SELECT id FROM tags WHERE id = ?", (tag_id,)).fetchone() is None

    def test_delete_cleans_tag_mappings(self, admin_client, db):
        from app.dal.tags import delete_tag
        db.execute("INSERT INTO tags (name) VALUES ('TempWithMapping')")
        tag_id = db.execute("SELECT id FROM tags WHERE name = 'TempWithMapping'").fetchone()["id"]
        db.execute("INSERT INTO tag_mappings (raw_tag, tag_id) VALUES ('raw_temp', ?)", (tag_id,))
        delete_tag(db, tag_id=tag_id)
        assert db.execute("SELECT raw_tag FROM tag_mappings WHERE tag_id = ?", (tag_id,)).fetchone() is None

    def test_delete_raises_not_found_for_missing_tag(self, admin_client, db):
        from app.dal.tags import delete_tag
        from app.exceptions import NotFoundError
        import pytest
        with pytest.raises(NotFoundError):
            delete_tag(db, tag_id=99999)

    def test_delete_raises_bad_input_when_books_present(self, admin_client, db):
        from app.dal.tags import delete_tag
        from app.exceptions import BadInputError
        import pytest
        # Seed (tests/seed.py): tag 1 → books {1, 3, 5} — см. TestMergeTagDAL.
        with pytest.raises(BadInputError):
            delete_tag(db, tag_id=1)


class TestGetNameWrappers:
    def test_tags_get_tag_name_returns_str_for_existing(self, admin_client, db):
        from app.services.tags_service import get_tag_name
        name = get_tag_name(db, 1)
        assert isinstance(name, str)
        assert name == "Фэнтези"

    def test_tags_get_tag_name_raises_not_found_for_missing(self, admin_client, db):
        from app.services.tags_service import get_tag_name
        from app.exceptions import NotFoundError
        import pytest
        with pytest.raises(NotFoundError):
            get_tag_name(db, 99999)

    def test_series_get_series_name_returns_str_for_existing(self, admin_client, db):
        from app.services.series_service import get_series_name
        name = get_series_name(db, 1)
        assert isinstance(name, str)

    def test_series_get_series_name_raises_not_found_for_missing(self, admin_client, db):
        from app.services.series_service import get_series_name
        from app.exceptions import NotFoundError
        import pytest
        with pytest.raises(NotFoundError):
            get_series_name(db, 99999)

    def test_authors_get_author_name_returns_str_for_existing(self, admin_client, db):
        from app.services.authors_service import get_author_name
        name = get_author_name(db, 1)
        assert isinstance(name, str)

    def test_authors_get_author_name_raises_not_found_for_missing(self, admin_client, db):
        from app.services.authors_service import get_author_name
        from app.exceptions import NotFoundError
        import pytest
        with pytest.raises(NotFoundError):
            get_author_name(db, 99999)


class TestTagServiceCRUD:
    def test_rename_tag_returns_true_on_change(self, admin_client, db):
        from app.services.tags_service import rename_tag
        changed = rename_tag(db, tag_id=1, name="Новое фэнтези")
        assert changed is True
        row = db.execute("SELECT name FROM tags WHERE id = 1").fetchone()
        assert row["name"] == "Новое фэнтези"

    def test_rename_tag_normalizes_name(self, admin_client, db):
        from app.services.tags_service import rename_tag
        changed = rename_tag(db, tag_id=1, name="новое фэнтези")
        assert changed is True
        row = db.execute("SELECT name FROM tags WHERE id = 1").fetchone()
        assert row["name"] == "Новое фэнтези"  # Capitalize first letter

    def test_rename_tag_normalized_idempotent(self, admin_client, db):
        """Идемпотентность повторного rename с любым регистром: tag 1 'Фэнтези',
        повтор с lowercase 'фэнтези' → same normalized → no-op."""
        from app.services.tags_service import rename_tag
        changed = rename_tag(db, tag_id=1, name="фэнтези")
        assert changed is False

    def test_rename_tag_raises_not_found(self, admin_client, db):
        from app.services.tags_service import rename_tag
        from app.exceptions import NotFoundError
        import pytest
        with pytest.raises(NotFoundError):
            rename_tag(db, tag_id=99999, name="Что-то")

    def test_merge_tag_returns_true_on_success(self, admin_client, db):
        from app.services.tags_service import merge_tag
        changed = merge_tag(db, target_id=2, source_id=1)
        assert changed is True

    def test_merge_tag_returns_false_on_nonexistent_source(self, admin_client, db):
        from app.services.tags_service import merge_tag
        changed = merge_tag(db, target_id=2, source_id=99999)
        assert changed is False

    def test_merge_tag_raises_bad_input_on_self_merge(self, admin_client, db):
        from app.services.tags_service import merge_tag
        from app.exceptions import BadInputError
        import pytest
        with pytest.raises(BadInputError):
            merge_tag(db, target_id=1, source_id=1)

    def test_delete_tag_delegates_to_dal(self, admin_client, db):
        from app.services.tags_service import delete_tag
        db.execute("INSERT INTO tags (name) VALUES ('TempForServiceTest')")
        tag_id = db.execute("SELECT id FROM tags WHERE name = 'TempForServiceTest'").fetchone()["id"]
        delete_tag(db, tag_id=tag_id)
        assert db.execute("SELECT id FROM tags WHERE id = ?", (tag_id,)).fetchone() is None


class TestDTOTightening:
    """Verify RenameBody and MergeBody reject invalid inputs.

    Уровень DTO — тестируем через любой существующий endpoint, использующий
    эти модели. Для RenameBody — series/authors rename. Для MergeBody —
    series/authors merge. Tag endpoints добавляются в Task 9, тесты на DTO
    через tag-endpoint появятся там же."""

    def test_rename_series_rejects_empty_name(self, admin_client):
        resp = admin_client.put("/api/series/1", json={"name": ""})
        assert resp.status_code == 422

    def test_rename_series_rejects_whitespace_only_name(self, admin_client):
        resp = admin_client.put("/api/series/1", json={"name": "   "})
        assert resp.status_code == 422

    def test_rename_authors_rejects_empty_name(self, admin_client):
        resp = admin_client.put("/api/authors/1", json={"name": ""})
        assert resp.status_code == 422

    def test_merge_series_rejects_zero_source_id(self, admin_client):
        resp = admin_client.post("/api/series/1/merge", json={"sourceId": 0})
        assert resp.status_code == 422

    def test_merge_series_rejects_negative_source_id(self, admin_client):
        resp = admin_client.post("/api/series/1/merge", json={"sourceId": -5})
        assert resp.status_code == 422

    def test_merge_authors_rejects_zero_source_id(self, admin_client):
        resp = admin_client.post("/api/authors/1/merge", json={"sourceId": 0})
        assert resp.status_code == 422


class TestTagDetailBookCount:
    def test_tag_detail_returns_book_count(self, admin_client, db):
        """GET /api/tags/{id} returns bookCount aggregate from book_tags JOIN."""
        # Seed: tag 1 (Фэнтези) → books {1, 3, 5} (3 книги)
        response = admin_client.get("/api/tags/1")
        assert response.status_code == 200
        tag = response.json()["tag"]
        assert "bookCount" in tag
        assert tag["bookCount"] == 3

    def test_tag_detail_empty_tag_bookcount_zero(self, admin_client, db):
        """Тег без книг — bookCount=0 (LEFT JOIN важно)."""
        db.execute("INSERT INTO tags (name) VALUES ('EmptyTagBC')")
        db.commit()
        tag_id = db.execute("SELECT id FROM tags WHERE name='EmptyTagBC'").fetchone()["id"]
        response = admin_client.get(f"/api/tags/{tag_id}")
        assert response.status_code == 200
        tag = response.json()["tag"]
        assert tag["bookCount"] == 0


class TestRegisterGetParameter:
    """Когда `register_get=False`, фабрика не регистрирует GET и не требует
    `get_<entity_label>` от service-модуля.

    Тест строится на новом APIRouter + минимальный мок-service, чтобы
    проверить именно factory-поведение в изоляции (не зацепить existing
    series/authors GET handlers)."""

    @staticmethod
    def _build_router(*, register_get, include_get_tag=False):
        import logging
        from fastapi import APIRouter
        from app.routers._entity_crud import register_entity_crud

        class MockService:
            @staticmethod
            def rename_tag(db, id, name):
                return True

            @staticmethod
            def merge_tag(db, target, source):
                return True

            @staticmethod
            def delete_tag(db, id):
                return None

            @staticmethod
            def get_tag_name(db, id):
                # Required factory dependency для re-read payload в *Renamed
                # событиях, независимо от register_get.
                return "stub"

        if include_get_tag:
            MockService.get_tag = staticmethod(lambda db, id, user_id: {"id": id})

        router = APIRouter()
        register_entity_crud(
            router,
            service=MockService,
            logger=logging.getLogger("test"),
            entity_label="tag",
            register_get=register_get,
        )
        return router

    @staticmethod
    def _routes_summary(router):
        from fastapi.routing import APIRoute
        return {(r.path, tuple(sorted(r.methods))) for r in router.routes if isinstance(r, APIRoute)}

    def test_register_get_false_skips_get_endpoint(self):
        router = self._build_router(register_get=False)
        methods_paths = self._routes_summary(router)
        # Routes registered должны быть только PUT, POST .../merge, DELETE — без GET /{entity_id}
        assert ("/{entity_id}", ("PUT",)) in methods_paths
        assert ("/{entity_id}/merge", ("POST",)) in methods_paths
        assert ("/{entity_id}", ("DELETE",)) in methods_paths
        # GET /{entity_id} НЕ зарегистрирован
        assert not any(path == "/{entity_id}" and "GET" in methods for path, methods in methods_paths)

    def test_register_get_true_includes_get_endpoint(self):
        """Default register_get=True сохраняет existing behavior (series/authors call-sites)."""
        router = self._build_router(register_get=True, include_get_tag=True)
        methods_paths = self._routes_summary(router)
        assert any(path == "/{entity_id}" and "GET" in methods for path, methods in methods_paths)
