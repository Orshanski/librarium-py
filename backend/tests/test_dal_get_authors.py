"""DAL-level tests for dal.authors.get_authors — tags field as list[TagRef]."""
import dataclasses

import pytest

from app.dtos._refs import TagRef
from app.dal import authors as dal_authors


@dataclasses.dataclass
class _AuthorStub:
    id: int


@pytest.fixture
def author_with_tagged_books(db):
    """Baseline author 1 ('Test Author') has two books, both tagged.

    Books 1 and 3 share tag 1 ('Фэнтези'), so without DISTINCT the correlated
    subquery would produce duplicates.
    """
    return _AuthorStub(id=1)


@pytest.fixture
def author_without_tagged_books(db):
    """Author created with one book but no tags."""
    db.execute(
        "INSERT INTO authors (id, name, sort_name) VALUES (99, 'Untagged Author', 'Author, Untagged')"
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) VALUES (99, 'Untagged Book', 'Untagged Book', 'ru', '2025-06-01 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (99, 99)")
    db.commit()
    return _AuthorStub(id=99)


def test_get_authors_returns_tags_as_refs(db, author_with_tagged_books):
    """tags field must be a list of TagRef, not a raw CSV string."""
    authors = dal_authors.get_authors(db, user_id=1, tag_ids=None, language=None)["authors"]
    a = next(a for a in authors if a["id"] == author_with_tagged_books.id)
    assert isinstance(a["tags"], list)
    assert all(isinstance(t, TagRef) for t in a["tags"])


def test_get_authors_empty_tags_for_author_without_tagged_books(db, author_without_tagged_books):
    """Author with a book but no tags must have tags == []."""
    authors = dal_authors.get_authors(db, user_id=1, tag_ids=None, language=None)["authors"]
    a = next(a for a in authors if a["id"] == author_without_tagged_books.id)
    assert a["tags"] == []


def test_get_authors_no_csv_field(db, author_with_tagged_books):
    """tags must never be a raw string — always a parsed list."""
    authors = dal_authors.get_authors(db, user_id=1, tag_ids=None, language=None)["authors"]
    a = next(a for a in authors if a["id"] == author_with_tagged_books.id)
    assert not isinstance(a["tags"], str)


def test_get_authors_no_duplicate_tags(db, author_with_tagged_books):
    """Author 1 has two books sharing the same tag — DISTINCT must prevent duplicates."""
    authors = dal_authors.get_authors(db, user_id=1, tag_ids=None, language=None)["authors"]
    a = next(a for a in authors if a["id"] == author_with_tagged_books.id)
    tag_ids = [t.id for t in a["tags"]]
    assert len(tag_ids) == len(set(tag_ids)), "Duplicate tags returned"
