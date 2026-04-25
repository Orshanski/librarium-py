"""DAL-level tests for dal.series.get_series — authors field as list[AuthorRef]."""
import dataclasses

import pytest

from app.dtos._refs import AuthorRef
from app.dal import series as dal_series


@dataclasses.dataclass
class _SeriesStub:
    id: int


@pytest.fixture
def series_with_single_author(db):
    """Baseline series 1 ('Test Series') has books 1 and 3, both by author 1
    ('Test Author'). Without DISTINCT the correlated subquery would produce
    duplicate author entries — one per book instead of one per author."""
    return _SeriesStub(id=1)


@pytest.fixture
def series_with_two_authors_inserted_non_alphabetically(db):
    """Series 50 has two books by two authors inserted in reverse alphabetical order.

    Authors: id=50 'Zebra Writer', id=51 'Anna Writer'. 'Zebra Writer' > 'Anna Writer'
    alphabetically, so insertion order does not match sorted order — verifies
    ORDER BY a.name in the derived table.
    """
    db.execute(
        "INSERT INTO authors (id, name, sort_name) VALUES (50, 'Zebra Writer', 'Writer, Zebra')"
    )
    db.execute(
        "INSERT INTO authors (id, name, sort_name) VALUES (51, 'Anna Writer', 'Writer, Anna')"
    )
    db.execute(
        "INSERT INTO series (id, name, sort_name) VALUES (50, 'Order Test Series', 'Order Test Series')"
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, added_at) "
        "VALUES (50, 'Order Book A', 'Order Book A', 'en', 50, '2025-09-01 00:00:00')"
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, added_at) "
        "VALUES (51, 'Order Book B', 'Order Book B', 'en', 50, '2025-09-02 00:00:00')"
    )
    # Deliberately insert Zebra (non-alphabetically first) before Anna.
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (50, 50)")
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (51, 51)")
    db.commit()
    return _SeriesStub(id=50)


def test_get_series_returns_authors_as_refs(db, series_with_single_author):
    """authors field must be a list of AuthorRef, not a raw CSV string."""
    result = dal_series.get_series(db, user_id=1)
    s = next(se for se in result["series"] if se["id"] == series_with_single_author.id)
    assert isinstance(s["authors"], list)
    assert all(isinstance(a, AuthorRef) for a in s["authors"])


def test_get_series_no_csv_field(db, series_with_single_author):
    """authors must never be a raw string — always a parsed list."""
    result = dal_series.get_series(db, user_id=1)
    s = next(se for se in result["series"] if se["id"] == series_with_single_author.id)
    assert not isinstance(s["authors"], str)


def test_get_series_no_duplicate_authors(db, series_with_single_author):
    """Series 1 has two books by the same author — DISTINCT must prevent duplicates."""
    result = dal_series.get_series(db, user_id=1)
    s = next(se for se in result["series"] if se["id"] == series_with_single_author.id)
    author_ids = [a.id for a in s["authors"]]
    assert len(author_ids) == len(set(author_ids)), "Duplicate authors returned"


def test_get_series_authors_sorted_alphabetically(
    db, series_with_two_authors_inserted_non_alphabetically
):
    """Regression: authors array on a returned series must be sorted alphabetically by name.

    This exercises the ORDER BY a.name inside the derived table in get_series.sql.
    """
    result = dal_series.get_series(db, user_id=1)
    s = next(
        se for se in result["series"]
        if se["id"] == series_with_two_authors_inserted_non_alphabetically.id
    )
    author_names = [a.name for a in s["authors"]]
    assert len(author_names) == 2
    assert author_names == sorted(author_names), f"Authors not alphabetically sorted: {author_names}"
