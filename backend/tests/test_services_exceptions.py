"""Unit tests для новых service-модулей (T4) и миграции сервисов на custom exceptions (T3).

Integration-tier (реальная БД через baseline fixture), но вызовы идут прямо в
service-функции без HTTP — поэтому эффективно unit-тесты для service-layer
контракта.
"""
import pytest

from app.exceptions import BadInputError, ConflictError, NotFoundError
from app.services import (
    authors_service,
    book_service,
    series_service,
    shelves_service,
    tags_service,
)


# ---------- T4: authors_service ----------


class TestAuthorsService:
    def test_get_author_missing_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            authors_service.get_author(db, 999999)

    def test_merge_self_raises_bad_input(self, db):
        with pytest.raises(BadInputError, match="Нельзя объединить с самим собой"):
            authors_service.merge_authors(db, 1, 1)

    def test_delete_missing_propagates_not_found(self, db):
        """Service делегирует в DAL — DAL raise'ит NotFoundError (T5)."""
        with pytest.raises(NotFoundError, match="Автор не найден"):
            authors_service.delete_author(db, 999999)


# ---------- T4: series_service ----------


class TestSeriesService:
    def test_get_series_missing_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            series_service.get_series(db, 999999)

    def test_merge_self_raises_bad_input(self, db):
        """Feminine 'самой собой' — не 'самим собой'."""
        with pytest.raises(BadInputError, match="Нельзя объединить с самой собой"):
            series_service.merge_series(db, 1, 1)

    def test_delete_missing_propagates_not_found(self, db):
        with pytest.raises(NotFoundError, match="Серия не найдена"):
            series_service.delete_series(db, 999999)


# ---------- T4: shelves_service ----------


class TestShelvesService:
    def test_get_missing_shelf_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            shelves_service.get_shelf(db, 999999, user_id=1)

    def test_update_missing_shelf_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            shelves_service.update_shelf(db, 999999, user_id=1, name="x")

    def test_delete_missing_shelf_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            shelves_service.delete_shelf(db, 999999, user_id=1)

    def test_add_book_to_missing_shelf_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            shelves_service.add_book(db, 999999, user_id=1, book_id=1)

    def test_remove_book_from_missing_shelf_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            shelves_service.remove_book(db, 999999, user_id=1, book_id=1)


# ---------- T4: tags_service ----------


class TestTagsService:
    def test_get_missing_tag_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            tags_service.get_tag(db, 999999, author_ids=[], series_ids=[], language=None)

    def test_map_missing_tag_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            tags_service.map_tag(db, 999999, name="new-tag-name")


# ---------- T3: book_service migration ----------


class TestBookServiceRaises:
    def test_upload_file_to_missing_book_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Book not found"):
            book_service.upload_file(db, 999999, b"fake content", "fb2")

    def test_upload_duplicate_format_raises_conflict(self, db):
        """Book 1 (baseline) has FB2 — uploading another FB2 raises ConflictError."""
        with pytest.raises(ConflictError, match=r"Формат FB2 уже есть"):
            book_service.upload_file(db, 1, b"fake content", "fb2")

    def test_delete_file_missing_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            book_service.delete_file(db, 1, "DOESNOTEXIST")

    def test_delete_book_missing_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Book not found"):
            book_service.delete_book(db, 999999)


# ---------- T3: cover_service migration ----------


class TestCoverServiceRaises:
    def test_upload_unsupported_format_raises_bad_input(self, db):
        from app.services import cover_service
        # Plain text — не валидное изображение.
        with pytest.raises(BadInputError, match="не является изображением|повреждён"):
            cover_service.upload_temp(book_id=1, content=b"not-an-image", ext="jpg")


# ---------- T3: upload_service migration ----------


class TestUploadServiceRaises:
    def test_create_book_missing_title_raises_bad_input(self, db):
        from app.services import upload_service
        with pytest.raises(BadInputError, match="Title required"):
            upload_service.create_book(db, temp_id="nonexistent", metadata={"title": ""})

    def test_create_book_missing_temp_raises_bad_input(self, db):
        from app.services import upload_service
        with pytest.raises(BadInputError, match="Temp file not found"):
            upload_service.create_book(db, temp_id="doesnotexist", metadata={"title": "X"})

    def test_add_format_missing_temp_raises_bad_input(self, db):
        from app.services import upload_service
        with pytest.raises(BadInputError, match="Temp file not found"):
            upload_service.add_format(db, book_id=1, temp_id="doesnotexist")
