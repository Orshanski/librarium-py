"""Fuzzy search — unit + DAL tests.

Scope of this file:
- unit tests for search_preprocess (pure function)
- DAL-level tests for search_books that exercise the fuzzy behaviour —
  cases plain LIKE could not match

API-level tests for /api/search live in test_catalog_search.py.

Fixture data (books 10..14, authors 10..12) is inserted per-test
rather than via the shared baseline seed so other tests don't need
to be updated for count changes.
"""
import pytest
from app.dtos._refs import AuthorRef, SeriesRef


# Author/book IDs are high enough not to collide with the shared
# baseline seed (which uses ids 1..5 for books and 1..3 for authors).
_BOOK_PUNCT = 10      # Проект "Аве Мария"
_BOOK_DOTPARTS = 11   # Три мушкетера. Часть 1
_BOOK_CONNECTIVE = 12 # Война и мир
_BOOK_YO = 13         # Видящая звёзды
_BOOK_ONEIL_FILLER = 14 # filler so author O'Нил has a book

_AUTHOR_SANDERSON = 10
_AUTHOR_DUMA = 11
_AUTHOR_ONEIL = 12


@pytest.fixture(autouse=True)
def _seed_fuzzy_fixtures():
    """Insert search-specific rows into the already-reset test DB.

    Runs after the autouse `reset_test_data` fixture in conftest.py,
    so each test starts with baseline + our fuzzy rows, and the next
    test gets a fresh reset again.
    """
    from app.database import _get_db
    db = _get_db()
    db.execute(
        "INSERT INTO authors (id, name, sort_name) VALUES (?, ?, ?)",
        (_AUTHOR_SANDERSON, "Брендон Сандерсон", "Сандерсон, Брендон"),
    )
    db.execute(
        "INSERT INTO authors (id, name, sort_name) VALUES (?, ?, ?)",
        (_AUTHOR_DUMA, "Александр Дюма", "Дюма, Александр"),
    )
    db.execute(
        "INSERT INTO authors (id, name, sort_name) VALUES (?, ?, ?)",
        (_AUTHOR_ONEIL, "Кэти О'Нил", "О Нил, Кэти"),
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) VALUES "
        "(?, ?, ?, 'ru', '2025-01-06 00:00:00')",
        (_BOOK_PUNCT, 'Проект "Аве Мария"', "Проект Аве Мария"),
    )
    db.execute(
        "INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
        (_BOOK_PUNCT, _AUTHOR_SANDERSON),
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) VALUES "
        "(?, ?, ?, 'ru', '2025-01-07 00:00:00')",
        (_BOOK_DOTPARTS, "Три мушкетера. Часть 1", "Три мушкетера Часть 1"),
    )
    db.execute(
        "INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
        (_BOOK_DOTPARTS, _AUTHOR_DUMA),
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) VALUES "
        "(?, ?, ?, 'ru', '2025-01-08 00:00:00')",
        (_BOOK_CONNECTIVE, "Война и мир", "Война и мир"),
    )
    db.execute(
        "INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
        (_BOOK_CONNECTIVE, _AUTHOR_DUMA),
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) VALUES "
        "(?, ?, ?, 'ru', '2025-01-09 00:00:00')",
        (_BOOK_YO, "Видящая звёзды", "Видящая звезды"),
    )
    db.execute(
        "INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
        (_BOOK_YO, _AUTHOR_SANDERSON),
    )
    # Filler title just so author O'Нил has ≥1 book (authors query JOINs book_authors).
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) VALUES "
        "(?, ?, ?, 'en', '2025-01-10 00:00:00')",
        (_BOOK_ONEIL_FILLER, "Weapons of Math Destruction", "Weapons of Math Destruction"),
    )
    db.execute(
        "INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
        (_BOOK_ONEIL_FILLER, _AUTHOR_ONEIL),
    )
    db.commit()
    yield


# ── search_preprocess ──

class TestSearchPreprocess:
    def test_lowercase(self):
        from app.search import search_preprocess
        assert search_preprocess("Проект") == "проект"

    def test_yo_to_e_lowercase(self):
        from app.search import search_preprocess
        assert search_preprocess("лёд") == "лед"

    def test_yo_to_e_uppercase(self):
        from app.search import search_preprocess
        assert search_preprocess("Ёлка") == "елка"

    def test_strips_punctuation(self):
        from app.search import search_preprocess
        # Quotes, dots, commas gone; content preserved and separated by single spaces
        assert search_preprocess('Проект "Аве Мария"') == "проект аве мария"

    def test_strips_punctuation_english(self):
        from app.search import search_preprocess
        assert search_preprocess("Three Musketeers, Part 1.") == "three musketeers part 1"

    def test_collapses_whitespace(self):
        from app.search import search_preprocess
        assert search_preprocess("Ольга  Громыко") == "ольга громыко"

    def test_handles_none(self):
        from app.search import search_preprocess
        assert search_preprocess(None) == ""

    def test_handles_empty(self):
        from app.search import search_preprocess
        assert search_preprocess("") == ""

    def test_preserves_digits(self):
        from app.search import search_preprocess
        assert search_preprocess("1984") == "1984"


# ── search_books (fuzzy-specific cases) ──
#
# These talk to the DAL directly. Seed already contains the fixtures
# we need (see backend/tests/seed.py: books 10..13, authors 10..12).

def _get_db():
    from app.database import _get_db as _g
    return _g()


def _book_ids(result):
    return [b["id"] for b in result["books"]]


def _author_ids(result):
    return [a["id"] for a in result["authors"]]


class TestSearchBooksFuzzy:
    def test_finds_title_with_punctuation(self):
        """The canonical win: query with no punctuation hits a title with it."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "проект аве мария", user_id=2)
        assert _BOOK_PUNCT in _book_ids(res), f"got books={res['books']}"

    def test_finds_title_with_different_punctuation(self):
        """Query with a dot omitted still hits."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "три мушкетера часть 1", user_id=2)
        assert _BOOK_DOTPARTS in _book_ids(res)

    def test_handles_word_order(self):
        """Query words in reverse order still match."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "мария аве проект", user_id=2)
        assert _BOOK_PUNCT in _book_ids(res)

    def test_handles_missing_connective(self):
        """Query drops 'и' — still finds 'Война и мир'."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "война мир", user_id=2)
        assert _BOOK_CONNECTIVE in _book_ids(res)

    def test_handles_simple_typo_in_author(self):
        """Typo in author name still finds their books."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "сандерсн", user_id=2)
        # Сандерсон wrote books _BOOK_PUNCT and _BOOK_YO
        assert (
            _AUTHOR_SANDERSON in _author_ids(res)
            or {_BOOK_PUNCT, _BOOK_YO} & set(_book_ids(res))
        )

    def test_yo_equivalence(self):
        """Query without ё finds a title with ё."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "видящая звезды", user_id=2)
        assert _BOOK_YO in _book_ids(res)

    def test_apostrophe_in_author(self):
        """Query without apostrophe finds 'Кэти О'Нил'."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "кэти онил", user_id=2)
        assert _AUTHOR_ONEIL in _author_ids(res)

    def test_empty_query_returns_empty_lists(self):
        from app.dal.books import search_books
        res = search_books(_get_db(), "", user_id=2)
        assert res["books"] == []
        assert res["authors"] == []
        assert res["series"] == []

    def test_whitespace_only_query_returns_empty(self):
        from app.dal.books import search_books
        res = search_books(_get_db(), "   ", user_id=2)
        assert res["books"] == []
        assert res["authors"] == []
        assert res["series"] == []

    def test_no_match_returns_empty(self):
        from app.dal.books import search_books
        res = search_books(_get_db(), "zzzznothingmatches", user_id=2)
        assert res["books"] == []
        assert res["authors"] == []
        assert res["series"] == []

    def test_limit_applies_to_books(self):
        """Router's `limit` parameter caps books only."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "книга", limit=2, user_id=2)
        assert len(res["books"]) <= 2

    def test_results_ordered_by_score_desc(self):
        """Highest-scoring match is first."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "проект аве мария", user_id=2)
        if len(res["books"]) >= 2:
            assert res["books"][0]["id"] == _BOOK_PUNCT


# ── pbz2: objects contract for search results ──


# IDs 20+ chosen to avoid baseline (1-5) and fuzzy seed (10-14).
_SERIES_STELMAH = 20
_BOOK_STELMAH = 20
_AUTHOR_STELMAH = 20

_SERIES_DEDUP = 21
_BOOK_DEDUP_A = 21
_BOOK_DEDUP_B = 22
_AUTHOR_DEDUP = 21


@pytest.fixture
def series_with_authors():
    """Series with one book and one author — the fuzzy `_seed_fuzzy_fixtures`
    fixture does not set up series data, so we add a self-contained series here."""
    from app.database import _get_db
    db = _get_db()
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (?, ?, ?)",
               (_AUTHOR_STELMAH, "Михаил Стельмах", "Стельмах, Михаил"))
    db.execute("INSERT INTO series (id, name) VALUES (?, ?)",
               (_SERIES_STELMAH, "Щедрий вечір"))
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, added_at) "
        "VALUES (?, ?, ?, 'uk', ?, '2025-03-01 00:00:00')",
        (_BOOK_STELMAH, "Щедрий вечір. Книга 1", "Щедрий вечір Книга 1", _SERIES_STELMAH),
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
               (_BOOK_STELMAH, _AUTHOR_STELMAH))
    db.commit()
    yield
    # cleanup handled by autouse reset_test_data in conftest


@pytest.fixture
def series_with_one_author_and_two_books():
    """Series with two books, both by the same author — regression fixture for
    the deduplication contract: SQL must not produce duplicate author entries
    when an author has multiple books in the same series."""
    from app.database import _get_db
    db = _get_db()
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (?, ?, ?)",
               (_AUTHOR_DEDUP, "Дедуп Автор", "Автор, Дедуп"))
    db.execute("INSERT INTO series (id, name) VALUES (?, ?)",
               (_SERIES_DEDUP, "Дедуп Серия"))
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, added_at) "
        "VALUES (?, ?, ?, 'ru', ?, '2025-03-02 00:00:00')",
        (_BOOK_DEDUP_A, "Дедуп Книга 1", "Дедуп Книга 1", _SERIES_DEDUP),
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, added_at) "
        "VALUES (?, ?, ?, 'ru', ?, '2025-03-03 00:00:00')",
        (_BOOK_DEDUP_B, "Дедуп Книга 2", "Дедуп Книга 2", _SERIES_DEDUP),
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
               (_BOOK_DEDUP_A, _AUTHOR_DEDUP))
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
               (_BOOK_DEDUP_B, _AUTHOR_DEDUP))
    db.commit()
    yield
    # cleanup handled by autouse reset_test_data in conftest


class TestSearchBooksObjectsContract:
    """search_books returns structured objects (AuthorRef/SeriesRef), not CSV strings."""

    def test_search_books_returns_authors_as_refs(self):
        from app.dal.books import search_books
        res = search_books(_get_db(), "проект", limit=10, user_id=2)
        assert len(res["books"]) >= 1
        book = next(b for b in res["books"] if b["id"] == _BOOK_PUNCT)
        assert isinstance(book["authors"], list)
        assert all(isinstance(a, AuthorRef) for a in book["authors"])

    def test_search_books_returns_series_as_ref_or_none(self):
        from app.dal.books import search_books
        res = search_books(_get_db(), "проект", limit=10, user_id=2)
        book = next(b for b in res["books"] if b["id"] == _BOOK_PUNCT)
        assert isinstance(book["series"], (SeriesRef, type(None)))

    def test_search_books_no_csv_fields(self):
        from app.dal.books import search_books
        res = search_books(_get_db(), "проект", limit=10, user_id=2)
        book = next(b for b in res["books"] if b["id"] == _BOOK_PUNCT)
        assert "author_ids" not in book
        assert "series_name" not in book
        assert "series_id" not in book

    def test_search_series_returns_authors_as_refs(self, series_with_authors):
        from app.dal.books import search_books
        res = search_books(_get_db(), "Щедрий", limit=10, user_id=2)
        assert len(res["series"]) >= 1
        s = next(se for se in res["series"] if se["id"] == _SERIES_STELMAH)
        assert isinstance(s["authors"], list)
        assert all(isinstance(a, AuthorRef) for a in s["authors"])

    def test_search_series_authors_deduplicate_when_author_has_multiple_books_in_series(
        self, series_with_one_author_and_two_books
    ):
        """Regression: corellated subquery must produce one entry per author,
        not one per (author, book) pair. Same applies to `book_count`."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "Дедуп", limit=10, user_id=2)
        s = next(se for se in res["series"] if se["id"] == _SERIES_DEDUP)
        author_ids = [a.id for a in s["authors"]]
        assert author_ids == [_AUTHOR_DEDUP], f"expected single entry, got {s['authors']}"
        assert s["book_count"] == 2


# ── S-3: Ordering regression for search_books_series ──

_SERIES_ORDER = 30
_BOOK_ORDER_A = 30
_BOOK_ORDER_B = 31
_AUTHOR_ZEBRA = 30   # name starts with 'Z' — inserted first
_AUTHOR_ANNA = 31    # name starts with 'A' — inserted second


@pytest.fixture
def series_with_authors_inserted_non_alphabetically():
    """Series 30 has two books by two authors inserted in reverse alphabetical order
    (Zebra Author before Anna Author). Verifies ORDER BY a.name in the derived table.
    """
    from app.database import _get_db
    db = _get_db()
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (?, ?, ?)",
               (_AUTHOR_ZEBRA, "Zebra Author", "Zebra, Author"))
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (?, ?, ?)",
               (_AUTHOR_ANNA, "Anna Author", "Author, Anna"))
    db.execute("INSERT INTO series (id, name) VALUES (?, ?)",
               (_SERIES_ORDER, "Order Regression Series"))
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, added_at) "
        "VALUES (?, ?, ?, 'en', ?, '2025-08-01 00:00:00')",
        (_BOOK_ORDER_A, "Order Series Book A", "Order Series Book A", _SERIES_ORDER),
    )
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, added_at) "
        "VALUES (?, ?, ?, 'en', ?, '2025-08-02 00:00:00')",
        (_BOOK_ORDER_B, "Order Series Book B", "Order Series Book B", _SERIES_ORDER),
    )
    # Deliberately insert Zebra (non-alphabetically first) before Anna
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
               (_BOOK_ORDER_A, _AUTHOR_ZEBRA))
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
               (_BOOK_ORDER_B, _AUTHOR_ANNA))
    db.commit()
    yield


def test_search_series_authors_sorted_alphabetically(
    series_with_authors_inserted_non_alphabetically,
):
    """Regression: authors array on a returned series row must be sorted alphabetically
    by name. Exercises ORDER BY a.name inside the derived table in search_books_series.sql.
    """
    from app.dal.books import search_books
    res = search_books(_get_db(), "Order Regression", limit=10, user_id=2)
    s = next((se for se in res["series"] if se["id"] == _SERIES_ORDER), None)
    assert s is not None, "Series not found in search results"
    author_names = [a.name for a in s["authors"]]
    assert len(author_names) == 2
    assert author_names == sorted(author_names), f"Authors not alphabetically sorted: {author_names}"


# ── Morphology aspirational ──
#
# WRatio may or may not handle Russian grammatical cases. We don't
# have Tolstoy or other morphology-heavy authors in the test seed,
# and the project's real library doesn't either — so this test would
# be fabricated. Left as a note only.
