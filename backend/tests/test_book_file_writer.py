"""Unit-тесты для book_file_writer helpers."""
import os

import pytest

from app.exceptions import ConflictError, NotFoundError
from app.services.book_file_writer import (
    book_dir_and_dst,
    prepare_book_format_path,
    register_and_linearize,
)


class TestBookDirAndDst:
    def test_creates_dir_and_returns_paths(self, tmp_path, monkeypatch):
        from app.services import book_file_writer
        monkeypatch.setattr(book_file_writer, "LIBRARY_DIR", tmp_path)
        book_dir, dst = book_dir_and_dst(book_id=42, ext="epub")
        assert book_dir == str(tmp_path / "42")
        assert dst == str(tmp_path / "42" / "book.epub")
        assert (tmp_path / "42").is_dir()

    def test_existing_dir_not_recreated(self, tmp_path, monkeypatch):
        from app.services import book_file_writer
        monkeypatch.setattr(book_file_writer, "LIBRARY_DIR", tmp_path)
        (tmp_path / "42").mkdir()
        (tmp_path / "42" / "marker.txt").write_bytes(b"preserved")
        book_dir_and_dst(book_id=42, ext="pdf")
        assert (tmp_path / "42" / "marker.txt").read_bytes() == b"preserved"


class TestPrepareBookFormatPath:
    def test_missing_book_raises_not_found(self, db):
        with pytest.raises(NotFoundError, match="Book not found"):
            prepare_book_format_path(db, book_id=999999, fmt="FB2", ext="fb2")

    def test_duplicate_format_raises_conflict(self, db):
        # Baseline: book 1 имеет FB2 (см. seed.py).
        with pytest.raises(ConflictError, match="Формат FB2 уже есть"):
            prepare_book_format_path(db, book_id=1, fmt="FB2", ext="fb2")

    def test_happy_returns_dst(self, db):
        # Book 1 имеет FB2, но не EPUB — новая регистрация должна пройти guard.
        dst = prepare_book_format_path(db, book_id=1, fmt="EPUB", ext="epub")
        assert dst.endswith("1/book.epub")


class TestRegisterAndLinearize:
    def test_non_pdf_registers_without_linearize(self, db, tmp_path, monkeypatch):
        from app import config
        from app.services import book_file_writer
        monkeypatch.setattr(config, "LIBRARY_DIR", tmp_path)
        book_dir = tmp_path / "1"
        book_dir.mkdir()
        dst = str(book_dir / "book.epub")
        with open(dst, "wb") as f:
            f.write(b"fake epub content")

        # Следим что linearize не вызывается на non-pdf.
        called = []
        monkeypatch.setattr(
            book_file_writer, "linearize_pdf_in_place",
            lambda p: called.append(p),
        )
        size = register_and_linearize(db, book_id=1, dst=dst, ext="epub")
        assert size == len(b"fake epub content")
        assert called == []

        from app.dal.books import get_book_file
        row = get_book_file(db, 1, "EPUB")
        assert row is not None

    def test_pdf_size_measured_after_linearize(self, db, tmp_path, monkeypatch):
        """Size измеряется ПОСЛЕ linearize — linearize меняет размер PDF."""
        from app import config
        from app.services import book_file_writer
        monkeypatch.setattr(config, "LIBRARY_DIR", tmp_path)
        book_dir = tmp_path / "1"
        book_dir.mkdir()
        dst = str(book_dir / "book.pdf")
        with open(dst, "wb") as f:
            f.write(b"original pdf content")

        def fake_linearize(path):
            # Симулируем что linearize меняет размер.
            with open(path, "wb") as f:
                f.write(b"linearized (different length)")

        monkeypatch.setattr(
            book_file_writer, "linearize_pdf_in_place", fake_linearize,
        )
        size = register_and_linearize(db, book_id=1, dst=dst, ext="pdf")
        assert size == len(b"linearized (different length)")

    def test_dal_failure_leaves_file_on_disk(self, db, tmp_path, monkeypatch):
        """Rollback — забота caller'а, register_and_linearize не удаляет файл."""
        from app import config
        from app.services import book_file_writer
        monkeypatch.setattr(config, "LIBRARY_DIR", tmp_path)
        book_dir = tmp_path / "1"
        book_dir.mkdir()
        dst = str(book_dir / "book.fb2")
        with open(dst, "wb") as f:
            f.write(b"content")

        def boom(*args, **kwargs):
            raise RuntimeError("simulated db failure")

        monkeypatch.setattr(book_file_writer.dal, "add_book_file", boom)
        with pytest.raises(RuntimeError):
            register_and_linearize(db, book_id=1, dst=dst, ext="fb2")
        # Файл остался — rollback не внутри helper'а.
        assert os.path.exists(dst)
