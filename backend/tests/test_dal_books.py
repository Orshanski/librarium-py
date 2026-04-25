"""Tests for dal.books.get_books — JSON-array contract (authors/tags/series as objects)."""
import pytest
from app.dtos._refs import AuthorRef, SeriesRef
from app.dal import books as dal


@pytest.fixture
def sample_book_with_two_authors(db):
    """Book with two authors inserted in non-alphabetical order (Smith before Brown)."""
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (201, 'Smith', 'Smith')")
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (202, 'Brown', 'Brown')")
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) "
        "VALUES (201, 'Two-Author Book', 'Two-Author Book', 'en', '2026-01-01 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (201, 201)")
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (201, 202)")
    db.commit()
    return db


@pytest.fixture
def book_without_authors(db):
    """Book with no authors at all."""
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) "
        "VALUES (202, 'No-Author Book', 'No-Author Book', 'en', '2026-01-02 00:00:00')"
    )
    db.commit()
    return db


class _BookStub:
    """Minimal stub to carry id for fixture returns."""
    def __init__(self, book_id: int):
        self.id = book_id


@pytest.fixture
def book_with_series(db):
    """Book that belongs to series 1 (exists in baseline seed)."""
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, series_number, added_at) "
        "VALUES (203, 'Series Book', 'Series Book', 'en', 1, 5, '2026-01-03 00:00:00')"
    )
    db.commit()
    return _BookStub(203)


@pytest.fixture
def book_without_series(db):
    """Book with no series."""
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) "
        "VALUES (204, 'No-Series Book', 'No-Series Book', 'en', '2026-01-04 00:00:00')"
    )
    db.commit()
    return _BookStub(204)


def test_get_books_returns_authors_as_list_of_refs(db, sample_book_with_two_authors):
    rows = dal.get_books(db, user_id=1, sort="addedDesc",
                         cursor=0, page_size=10,
                         author_ids=None, tag_ids=None,
                         series_ids=None, language=None)
    assert len(rows) >= 1
    book = next(r for r in rows if r["id"] == 201)
    assert isinstance(book["authors"], list)
    assert len(book["authors"]) == 2
    assert all(isinstance(a, AuthorRef) for a in book["authors"])
    # ORDER BY name — alphabetically smaller goes first
    assert book["authors"][0].name < book["authors"][1].name


def test_get_books_returns_empty_authors_for_book_without_authors(db, book_without_authors):
    rows = dal.get_books(db, user_id=1, sort="addedDesc", cursor=0, page_size=10,
                         author_ids=None, tag_ids=None, series_ids=None, language=None)
    target = next(r for r in rows if r["id"] == 202)
    assert target["authors"] == []


def test_get_books_returns_series_as_ref_or_none(db, book_with_series, book_without_series):
    rows = dal.get_books(db, user_id=1, sort="addedDesc", cursor=0, page_size=10,
                         author_ids=None, tag_ids=None, series_ids=None, language=None)
    by_id = {r["id"]: r for r in rows}
    assert isinstance(by_id[book_with_series.id]["series"], SeriesRef)
    assert by_id[book_without_series.id]["series"] is None


def test_get_books_no_author_ids_or_tag_ids_in_row(db, sample_book_with_two_authors):
    rows = dal.get_books(db, user_id=1, sort="addedDesc", cursor=0, page_size=10,
                         author_ids=None, tag_ids=None, series_ids=None, language=None)
    book = next(r for r in rows if r["id"] == 201)
    assert "author_ids" not in book
    assert "tag_ids" not in book
    assert "series_id" not in book
    assert "series_name" not in book
