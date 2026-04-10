"""Fuzzy search tests.

API-level tests for /api/search live in test_catalog_filters.py and
remain as the wire-format regression guard. This file covers:

- unit tests for search_preprocess (pure function)
- DAL-level tests for search_books that exercise the *new* fuzzy
  behaviour — cases plain LIKE could not match.

Fixture data (books 10..14, authors 10..12) is inserted per-test
rather than via the shared baseline seed so test_catalog_filters
and friends don't need to be updated for count changes.
"""
import pytest


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
        res = search_books(_get_db(), "проект аве мария")
        assert _BOOK_PUNCT in _book_ids(res), f"got books={res['books']}"

    def test_finds_title_with_different_punctuation(self):
        """Query with a dot omitted still hits."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "три мушкетера часть 1")
        assert _BOOK_DOTPARTS in _book_ids(res)

    def test_handles_word_order(self):
        """Query words in reverse order still match."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "мария аве проект")
        assert _BOOK_PUNCT in _book_ids(res)

    def test_handles_missing_connective(self):
        """Query drops 'и' — still finds 'Война и мир'."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "война мир")
        assert _BOOK_CONNECTIVE in _book_ids(res)

    def test_handles_simple_typo_in_author(self):
        """Typo in author name still finds their books."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "сандерсн")
        # Сандерсон wrote books _BOOK_PUNCT and _BOOK_YO
        assert (
            _AUTHOR_SANDERSON in _author_ids(res)
            or {_BOOK_PUNCT, _BOOK_YO} & set(_book_ids(res))
        )

    def test_yo_equivalence(self):
        """Query without ё finds a title with ё."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "видящая звезды")
        assert _BOOK_YO in _book_ids(res)

    def test_apostrophe_in_author(self):
        """Query without apostrophe finds 'Кэти О'Нил'."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "кэти онил")
        assert _AUTHOR_ONEIL in _author_ids(res)

    def test_empty_query_returns_empty_lists(self):
        from app.dal.books import search_books
        res = search_books(_get_db(), "")
        assert res == {"books": [], "authors": [], "series": []}

    def test_whitespace_only_query_returns_empty(self):
        from app.dal.books import search_books
        res = search_books(_get_db(), "   ")
        assert res == {"books": [], "authors": [], "series": []}

    def test_no_match_returns_empty(self):
        from app.dal.books import search_books
        res = search_books(_get_db(), "zzzznothingmatches")
        assert res["books"] == []
        assert res["authors"] == []
        assert res["series"] == []

    def test_limit_applies_to_books(self):
        """Router's `limit` parameter caps books only."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "книга", limit=2)
        assert len(res["books"]) <= 2

    def test_results_ordered_by_score_desc(self):
        """Highest-scoring match is first."""
        from app.dal.books import search_books
        res = search_books(_get_db(), "проект аве мария")
        if len(res["books"]) >= 2:
            assert res["books"][0]["id"] == _BOOK_PUNCT


# ── Morphology aspirational ──
#
# WRatio may or may not handle Russian grammatical cases. We don't
# have Tolstoy or other morphology-heavy authors in the test seed,
# and the project's real library doesn't either — so this test would
# be fabricated. Left as a note only.
