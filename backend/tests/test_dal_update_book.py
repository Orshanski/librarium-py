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
        "title": "New Title",
        "pub_date": "2020-01-01",
        "series_id": None,
        "author_ids": [1, 2],
        "tag_ids": [2],
        "cover_path": "/new/cover.jpg",
    })
    fresh = dal.get_book_by_id(db, sample_book.id)

    assert fresh["title"] == "New Title"
    assert fresh["pub_date"] == "2020-01-01"
    assert fresh["cover_path"] == "/new/cover.jpg"

    # series_id cleared
    assert fresh["series"] is None

    # sort_title recomputed from new title (no leading article, unchanged)
    assert fresh["sort_title"] == "New Title"

    # author_ids association updated: now [1, 2]
    rows = db.execute(
        "SELECT author_id FROM book_authors WHERE book_id = ? ORDER BY author_id",
        (sample_book.id,),
    ).fetchall()
    assert [r[0] for r in rows] == [1, 2]

    # tag_ids association updated: now [2]
    rows = db.execute(
        "SELECT tag_id FROM book_tags WHERE book_id = ? ORDER BY tag_id",
        (sample_book.id,),
    ).fetchall()
    assert [r[0] for r in rows] == [2]


def test_update_book_sort_title_strips_leading_article(db, sample_book):
    """sort_title recomputed: 'The ...' loses leading article."""
    dal.update_book(db, book_id=sample_book.id, data={"title": "The Great Book"})
    fresh = dal.get_book_by_id(db, sample_book.id)
    assert fresh["sort_title"] == "Great Book"
