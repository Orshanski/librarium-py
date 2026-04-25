"""Тесты для `dal.books.find_duplicates_by_title` — контракт `authors` как `list[AuthorRef]`."""
import pytest
from app.dtos._refs import AuthorRef
from app.dal import books as dal


@pytest.fixture
def books_same_title(db):
    """Два экземпляра одинакового заголовка с разными авторами."""
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (301, 'Alpha Author', 'Author, Alpha')")
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (302, 'Beta Author', 'Author, Beta')")
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) "
        "VALUES (301, 'Duplicate Title Book', 'Duplicate Title Book', 'en', '2026-01-10 00:00:00')"
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) "
        "VALUES (302, 'Duplicate Title Book', 'Duplicate Title Book', 'en', '2026-01-11 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (301, 301)")
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (302, 302)")
    db.commit()

    class _Stub:
        def __init__(self, title: str):
            self.title = title

    return [_Stub("Duplicate Title Book"), _Stub("Duplicate Title Book")]


def test_find_duplicates_returns_authors_as_refs(db, books_same_title):
    """Каждый хит содержит `authors` как `list[AuthorRef]`."""
    hits = dal.find_duplicates_by_title(db, title=books_same_title[0].title)
    assert len(hits) >= 1
    assert isinstance(hits[0]["authors"], list)
    assert all(isinstance(a, AuthorRef) for a in hits[0]["authors"])


def test_find_duplicates_no_authors_csv_field(db, books_same_title):
    """Поле `authors` — не строка CSV."""
    hits = dal.find_duplicates_by_title(db, title=books_same_title[0].title)
    h = hits[0]
    assert not isinstance(h["authors"], str)


def test_find_duplicates_author_fields_have_id_and_name(db, books_same_title):
    """Каждый `AuthorRef` содержит `id` и `name`."""
    hits = dal.find_duplicates_by_title(db, title=books_same_title[0].title)
    for hit in hits:
        for author in hit["authors"]:
            assert isinstance(author.id, int)
            assert isinstance(author.name, str)


def test_find_duplicates_empty_authors_for_book_without_authors(db):
    """Книга без авторов возвращает пустой список, не `None`."""
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) "
        "VALUES (303, 'Orphan Duplicate', 'Orphan Duplicate', 'en', '2026-01-12 00:00:00')"
    )
    db.commit()
    hits = dal.find_duplicates_by_title(db, title="Orphan Duplicate")
    assert len(hits) == 1
    assert hits[0]["authors"] == []
