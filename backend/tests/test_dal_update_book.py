"""DAL-level tests for dal.books.update_book — snake_case data contract."""
import pytest
from app.dal import books as dal


class _BookStub:
    def __init__(self, book_id: int):
        self.id = book_id


@pytest.fixture
def sample_book(db):
    """Insert a minimal book for update tests; author 1 and tag 1 exist in baseline seed."""
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) "
        "VALUES (901, 'Original Title', 'Original Title', 'en', '2026-01-01 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (901, 1)")
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (901, 1)")
    db.commit()
    return _BookStub(901)


def test_update_book_accepts_snake_case_data(db, sample_book):
    dal.update_book(db, book_id=sample_book.id, data={
        "title": "X",
        "pub_date": "2020-01-01",
        "series_id": None,
        "author_ids": [1, 2],
        "tag_ids": [2],
        "cover_path": "/path",
    })
    fresh = dal.get_book_by_id(db, sample_book.id)
    assert fresh["title"] == "X"
    assert fresh["pub_date"] == "2020-01-01"
