from pathlib import Path

from app.parsers import parse_book

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_parse_fb2():
    meta = parse_book(str(FIXTURES / "minimal.fb2"), "fb2")
    assert meta.title == "Minimal Test Book"
    assert "Test Author" in meta.authors
    assert meta.series == "Test Series"
    assert meta.series_number == 1.0
    assert meta.language == "Русский"
    assert meta.publisher == "Test Publisher"
    assert meta.isbn == "978-0-000-00001-0"
    assert "Фэнтези" in meta.genres


def test_parse_fb2_with_cover():
    meta = parse_book(str(FIXTURES / "with-cover.fb2"), "fb2")
    assert meta.title == "Book With Cover"
    assert "Cover Writer" in meta.authors
    assert meta.cover_data is not None
    assert meta.cover_ext is not None


def test_parse_epub():
    meta = parse_book(str(FIXTURES / "minimal.epub"), "epub")
    assert meta.title == "EPUB Test Book"
    assert "EPUB Author" in meta.authors
    assert meta.language == "English"


def test_parse_duplicate_same_metadata():
    meta = parse_book(str(FIXTURES / "duplicate.fb2"), "fb2")
    assert meta.title == "Minimal Test Book"
    assert "Test Author" in meta.authors
