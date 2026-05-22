"""Unit tests для новых service-модулей (T4) и миграции сервисов на custom exceptions (T3).

Integration-tier (реальная БД через baseline fixture), но вызовы идут прямо в
service-функции без HTTP — поэтому эффективно unit-тесты для service-layer
контракта.
"""
import pytest

from app.dtos.books import UpdateBookBody
from app.dtos.upload import CreateBookMetadataIn
from app.exceptions import BadInputError, NotFoundError
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
            authors_service.get_author(db, 999999, 2)

    def test_merge_self_raises_bad_input(self, db):
        with pytest.raises(BadInputError, match="Нельзя объединить с самим собой"):
            authors_service.merge_authors(db, 1, 1)

    def test_delete_missing_propagates_not_found(self, db):
        """Service делегирует в DAL — DAL raise'ит NotFoundError (T5)."""
        with pytest.raises(NotFoundError, match="Автор не найден"):
            authors_service.delete_author(db, 999999)

    def test_rename_missing_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Автор не найден"):
            authors_service.rename_author(db, 999999, "Whatever")


# ---------- T4: series_service ----------


class TestSeriesService:
    def test_get_series_missing_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            series_service.get_series(db, 999999, 2)

    def test_merge_self_raises_bad_input(self, db):
        """Feminine 'самой собой' — не 'самим собой'."""
        with pytest.raises(BadInputError, match="Нельзя объединить с самой собой"):
            series_service.merge_series(db, 1, 1)

    def test_delete_missing_propagates_not_found(self, db):
        with pytest.raises(NotFoundError, match="Серия не найдена"):
            series_service.delete_series(db, 999999)

    def test_rename_missing_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Серия не найдена"):
            series_service.rename_series(db, 999999, "Whatever")


# ---------- T4: shelves_service ----------


class TestShelvesService:
    def test_get_missing_shelf_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Not found"):
            shelves_service.get_shelf(db, 999999, user_id=1, sort="addedDesc")

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
            tags_service.get_tag(db, 999999, user_id=1, author_ids=[], series_ids=[], language=None, sort="addedDesc")


# ---------- T3: book_service migration ----------


class TestBookServiceRaises:
    def test_delete_book_missing_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Book not found"):
            book_service.delete_book(db, 999999)


# ---------- T9: book_service.get_book / update_book ----------


class TestBookServiceGetBook:
    def test_missing_book_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Book not found"):
            book_service.get_book(db, 999999, user_id=1)

    def test_existing_book_returns_detail_response(self, db):
        """Baseline: book 1 existing — returns BookDetailResponse with book/files/identifiers."""
        from app.dtos.books import BookDetailResponse
        result = book_service.get_book(db, 1, user_id=1)
        assert isinstance(result, BookDetailResponse)
        assert result.book is not None
        assert isinstance(result.files, list)
        assert isinstance(result.identifiers, list)


class TestBookServiceUpdateBook:
    def test_missing_book_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Book not found"):
            book_service.update_book(db, 999999, UpdateBookBody(title="whatever"))

    def test_update_existing_book_without_resolves(self, db):
        """Simple field update — без resolve_*."""
        book_service.update_book(db, 1, UpdateBookBody(description="Updated description"))
        row = db.execute("SELECT description FROM books WHERE id=1").fetchone()
        assert row["description"] == "Updated description"

    def test_update_resolves_authorids_from_string(self, db):
        """authorIds=['New Author'] — resolve внутри service создаёт нового автора
        и обновляет привязку книги."""
        book_service.update_book(db, 1, UpdateBookBody(authorIds=["Totally New Author T9"]))  # pyright: ignore[reportCallIssue]
        rows = db.execute(
            "SELECT a.name FROM authors a JOIN book_authors ba ON ba.author_id=a.id WHERE ba.book_id=1"
        ).fetchall()
        names = [r["name"] for r in rows]
        assert "Totally New Author T9" in names

    def test_update_resolves_tagids_from_string(self, db):
        book_service.update_book(db, 1, UpdateBookBody(tagIds=["BrandNewTagT9"]))  # pyright: ignore[reportCallIssue]
        rows = db.execute(
            "SELECT t.name FROM tags t JOIN book_tags bt ON bt.tag_id=t.id WHERE bt.book_id=1"
        ).fetchall()
        names = [r["name"] for r in rows]
        assert "BrandNewTagT9" in names

    def test_update_resolves_series_from_string(self, db):
        book_service.update_book(db, 1, UpdateBookBody(seriesId="Brand New Series T9"))  # pyright: ignore[reportCallIssue]
        row = db.execute(
            "SELECT s.name FROM series s JOIN books b ON b.series_id=s.id WHERE b.id=1"
        ).fetchone()
        assert row is not None
        assert row["name"] == "Brand New Series T9"

    def test_update_add_formats_via_service(self, db):
        """Direct service call: addFormats применяется. Temp-файл записан прямо
        в UPLOADS_DIR (минуя HTTP admin_client, чтобы не плодить конкурирующие connection'ы)."""
        from app.config import UPLOADS_DIR
        from pathlib import Path
        fixtures = Path(__file__).parent / "fixtures" / "books"
        temp_id = "svcepub1234"
        temp_path = UPLOADS_DIR / f"{temp_id}.epub"
        temp_path.write_bytes((fixtures / "minimal.epub").read_bytes())
        try:
            book_service.update_book(db, 1, UpdateBookBody(addFormats=[temp_id]))  # pyright: ignore[reportCallIssue]
            formats = [r["format"] for r in db.execute(
                "SELECT format FROM book_files WHERE book_id=1"
            ).fetchall()]
            assert "EPUB" in formats
        finally:
            # Cleanup: если тест упал до `cleanup_temp_session`, убрать temp руками.
            if temp_path.exists():
                temp_path.unlink()

    def test_update_delete_formats_via_service(self, db):
        book_service.update_book(db, 1, UpdateBookBody(deleteFormats=["FB2"]))  # pyright: ignore[reportCallIssue]
        formats = [r["format"] for r in db.execute(
            "SELECT format FROM book_files WHERE book_id=1"
        ).fetchall()]
        assert "FB2" not in formats

    def test_update_commit_cover_without_pending_raises(self, db):
        with pytest.raises(BadInputError, match="No pending cover"):
            book_service.update_book(db, 1, UpdateBookBody(commitCover=True))  # pyright: ignore[reportCallIssue]


# ---------- T3: cover_service migration ----------


class TestCoverServiceRaises:
    def test_upload_unsupported_format_raises_bad_input(self, db):
        from app.services import cover_service
        # Plain text — не валидное изображение.
        with pytest.raises(BadInputError, match="не является изображением|повреждён"):
            cover_service.upload_temp(db, book_id=1, content=b"not-an-image", ext="jpg")


# ---------- T3: upload_service migration ----------


class TestUploadServiceRaises:
    def test_create_book_missing_title_raises_bad_input(self, db):
        from app.services import upload_service
        with pytest.raises(BadInputError, match="Title required"):
            upload_service.create_book(db, temp_id="nonexistent", metadata=CreateBookMetadataIn(title=""))

    def test_create_book_missing_temp_raises_bad_input(self, db):
        from app.services import upload_service
        with pytest.raises(BadInputError, match="Temp file not found"):
            upload_service.create_book(db, temp_id="doesnotexist", metadata=CreateBookMetadataIn(title="X"))

    def test_add_format_missing_temp_raises_bad_input(self, db):
        from app.services import upload_service
        with pytest.raises(BadInputError, match="Temp file not found"):
            upload_service.add_format(db, book_id=1, temp_id="doesnotexist")
