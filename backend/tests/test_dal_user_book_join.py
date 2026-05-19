"""DAL: author/series/search SQLs include rating and is_read via JOIN with user_books.

Fixtures used (from conftest.py): db. The autouse reset_test_data fixture loads
baseline data before every test, so seeded users (admin=1, reader=2) already exist.
"""
import pytest
from app.dal import authors as dal_authors


@pytest.fixture
def current_user_id() -> int:
    """Reader user id from baseline (id=2). Used in DAL-level tests that take user_id directly."""
    return 2


@pytest.fixture
def author_with_rated_book(db, current_user_id):
    """Seed: 1 author, 1 book, user_books entry with rating=4 and is_read=True."""
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (100, 'A', 'A')")
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at, updated_at) "
        "VALUES (200, 'B', 'B', 'en', '2020-01-01 00:00:00', '2020-01-01 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (200, 100)")
    db.execute(
        "INSERT INTO user_books (user_id, book_id, rating, is_read) VALUES (?, 200, 4, 1)",
        (current_user_id,),
    )
    db.commit()


def test_get_author_books_returns_rating_and_is_read(db, current_user_id, author_with_rated_book):
    """get_author_by_id must include rating and is_read in books[] rows."""
    result = dal_authors.get_author_by_id(db, 100, current_user_id)
    assert result is not None
    assert len(result["books"]) == 1
    book = result["books"][0]
    assert book["rating"] == 4
    assert book["is_read"] in (True, 1)


def test_get_author_books_null_when_no_user_book_row(db, current_user_id):
    """If user_books has no entry for this user/book, rating is None and is_read is False/0."""
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (101, 'A2', 'A2')")
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at, updated_at) "
        "VALUES (201, 'B2', 'B2', 'en', '2020-01-01 00:00:00', '2020-01-01 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (201, 101)")
    db.commit()

    result = dal_authors.get_author_by_id(db, 101, current_user_id)
    book = result["books"][0]
    assert book["rating"] is None
    assert book["is_read"] in (False, 0, None)


def test_get_series_books_returns_rating_and_is_read(db, current_user_id):
    """get_series_by_id must include rating and is_read in books[] rows."""
    from app.dal import series as dal_series
    db.execute("INSERT INTO series (id, name, sort_name) VALUES (300, 'S', 'S')")
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, series_number, added_at, updated_at) "
        "VALUES (301, 'B', 'B', 'en', 300, 1.0, '2020-01-01 00:00:00', '2020-01-01 00:00:00')"
    )
    db.execute(
        "INSERT INTO user_books (user_id, book_id, rating, is_read) VALUES (?, 301, 5, 0)",
        (current_user_id,),
    )
    db.commit()

    result = dal_series.get_series_by_id(db, 300, current_user_id)
    book = result["books"][0]
    assert book["rating"] == 5
    assert book["is_read"] in (False, 0)
