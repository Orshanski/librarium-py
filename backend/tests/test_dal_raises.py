"""Unit tests для DAL raising миграции (T5): delete_author / delete_series."""
import pytest

from app.dal import authors as dal_authors
from app.dal import series as dal_series
from app.exceptions import BadInputError, NotFoundError


class TestDeleteAuthor:
    def test_missing_author_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Автор не найден"):
            dal_authors.delete_author(db, 999999)

    def test_author_with_books_raises_bad_input(self, db):
        """Baseline: автор id=1 связан с книгой. Попытка удалить — BadInputError."""
        with pytest.raises(BadInputError, match="Нельзя удалить автора с книгами"):
            dal_authors.delete_author(db, 1)

    def test_orphan_author_deleted_silently(self, db):
        """Создаём автора без книг — delete должен вернуть None (успех)."""
        cursor = db.execute("INSERT INTO authors (name) VALUES ('Orphan Author')")
        orphan_id = cursor.lastrowid
        assert dal_authors.delete_author(db, orphan_id) is None


class TestDeleteSeries:
    def test_missing_series_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Серия не найдена"):
            dal_series.delete_series(db, 999999)

    def test_series_with_books_raises_bad_input(self, db):
        """Baseline: серия id=1 содержит книгу. Попытка удалить — BadInputError."""
        with pytest.raises(BadInputError, match="Нельзя удалить серию с книгами"):
            dal_series.delete_series(db, 1)

    def test_orphan_series_deleted_silently(self, db):
        """Серия без книг → None (успех)."""
        cursor = db.execute("INSERT INTO series (name) VALUES ('Orphan Series')")
        orphan_id = cursor.lastrowid
        assert dal_series.delete_series(db, orphan_id) is None
