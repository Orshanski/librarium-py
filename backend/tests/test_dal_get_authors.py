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
    assert len(a["tags"]) == 1
    assert all(isinstance(t, TagRef) for t in a["tags"])


def test_get_authors_empty_tags_for_author_without_tagged_books(db, author_without_tagged_books):
    """Author with a book but no tags must have tags == []."""
    authors = dal_authors.get_authors(db, user_id=1, tag_ids=None, language=None)["authors"]
    a = next(a for a in authors if a["id"] == author_without_tagged_books.id)
    assert a["tags"] == []


def test_get_authors_includes_author_without_books(db):
    """Directory must show manually-created authors even before books are attached."""
    db.execute(
        "INSERT INTO authors (id, name, sort_name) VALUES (199, 'Empty Author', 'Author, Empty')"
    )
    db.commit()

    authors = dal_authors.get_authors(db, user_id=1, tag_ids=None, language=None)["authors"]
    a = next(a for a in authors if a["id"] == 199)

    assert a["book_count"] == 0
    assert a["tags"] == []


def test_get_authors_includes_author_without_books_when_user_has_hidden_books(db):
    """Hidden-book scope must not hide entities that have no books at all."""
    db.execute(
        "INSERT INTO authors (id, name, sort_name) VALUES (199, 'Empty Author', 'Author, Empty')"
    )
    db.execute(
        "INSERT INTO user_books (user_id, book_id, is_hidden) VALUES (1, 1, 1)"
    )
    db.commit()

    authors = dal_authors.get_authors(db, user_id=1, tag_ids=None, language=None)["authors"]
    a = next(a for a in authors if a["id"] == 199)

    assert a["book_count"] == 0
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
    assert len(tag_ids) == 1
    assert len(tag_ids) == len(set(tag_ids)), "Duplicate tags returned"


@pytest.fixture
def author_with_multiple_tags_inserted_non_alphabetically(db):
    """Author 50 has two books with two different tags inserted in reverse alphabetical order.

    Tags: id=50 'Приключения', id=51 'Антиутопия'. 'Приключения' > 'Антиутопия' alphabetically,
    so insertion order does not match sorted order — verifies ORDER BY t.name in the SQL.
    """
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (50, 'Order Author', 'Author, Order')")
    db.execute("INSERT INTO tags (id, name) VALUES (50, 'Приключения')")
    db.execute("INSERT INTO tags (id, name) VALUES (51, 'Антиутопия')")
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) "
        "VALUES (50, 'Book Fanfic', 'Book Fanfic', 'ru', '2025-07-01 00:00:00')"
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) "
        "VALUES (51, 'Book Detective', 'Book Detective', 'ru', '2025-07-02 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (50, 50)")
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (51, 50)")
    # Теги вставляются в неалфавитном порядке id (50 «Приключения» раньше 51 «Антиутопия»),
    # чтобы ORDER BY t.name в derived table отрабатывал на видимом контрасте.
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (50, 50)")
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (51, 51)")
    db.commit()
    return _AuthorStub(id=50)


def test_get_authors_tags_sorted_alphabetically(db, author_with_multiple_tags_inserted_non_alphabetically):
    """Regression: tags array on a returned author must be sorted alphabetically by name.

    This exercises the ORDER BY t.name inside the derived table in get_authors.sql.
    """
    authors = dal_authors.get_authors(db, user_id=1, tag_ids=None, language=None)["authors"]
    a = next(a for a in authors if a["id"] == author_with_multiple_tags_inserted_non_alphabetically.id)
    tag_names = [t.name for t in a["tags"]]
    assert len(tag_names) == 2
    assert tag_names == sorted(tag_names), f"Tags not alphabetically sorted: {tag_names}"
