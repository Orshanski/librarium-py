"""
Baseline snapshot tests for DAL book-listing queries.

Purpose: lock down current behavior of get_author_by_id / get_series_by_id /
get_tag_by_id / get_shelf_by_id / get_books / get_book_by_id so the E5 refactor
can prove byte-identical semantics (modulo the intended GROUP_CONCAT ORDER BY
change introduced in Task 2).

These tests use SET-MEMBERSHIP assertions for GROUP_CONCAT content because
current SQL has no ORDER BY inside aggregates. Task 3+ tighten to exact string
once the ORDER BY contract is in place.

Extra fixture: we add a multi-author book (book_id=100) whose authors are
inserted in non-alphabetical order to prove the Task 2 ORDER BY fix works.
"""
import pytest
from app.dal import authors as authors_dal
from app.dal import series as series_dal
from app.dal import tags as tags_dal
from app.dal import shelves as shelves_dal
from app.dal import books as books_dal


@pytest.fixture
def db_with_multi_author(db):
    """Adds book_id=100 with authors 'Smith' (id=101) then 'Brown' (id=102)
    — non-alphabetical insertion — plus tags id=1 and id=2 (non-alphabetical
    Cyrillic), and places the book into series 1 at series_number=10 (after
    book 3 which has series_number=2). This lets series tests verify the
    GROUP_CONCAT ORDER BY contract alongside the author-page tests."""
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (101, 'Smith', 'Smith')")
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (102, 'Brown', 'Brown')")
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, series_number, added_at) "
        "VALUES (100, 'Multi-Author Book', 'Multi-Author Book', 'en', 1, 10, '2025-01-10 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (100, 101)")
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (100, 102)")
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (100, 1)")
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (100, 2)")
    db.commit()
    return db


# --- Exact column sets per DAL query context ---
#
# These lock down the shape of every book-listing response against accidental
# SELECT drift (spec acceptance: "Full column set asserted via dict.keys()").
# Any schema/fragment change that adds or removes a column in these queries
# MUST also update the relevant constant — that's the whole point of snapshot
# tests.
#
# NOTE: `isbn` is NOT in b.* — it lives in `book_identifiers` (separate table)
# and is attached at the router/DTO layer, not the DAL.

# Entity-detail pages (get_author_by_id / get_series_by_id / get_tag_by_id).
# Uses BOOK_LIST_AGGREGATE_COLUMNS only (no user-specific extras).
EXPECTED_ENTITY_DETAIL_COLUMNS = {
    "id", "title", "sort_title", "description", "language", "publisher",
    "pub_date", "series_id", "series_number", "cover_path", "added_at",
    "updated_at",
    "series_name", "authors", "tags",
}

# Shelf queries now include author_ids, tag_ids, rating, is_read in all branches
# (the SQL SELECTs them via GROUP_CONCAT and LEFT JOIN user_books).
EXPECTED_SHELF_BASE_COLUMNS = EXPECTED_ENTITY_DETAIL_COLUMNS | {
    "author_ids", "tag_ids", "rating", "is_read",
}

# "best" shelf branch: base + rating (already in base, alias kept for clarity).
EXPECTED_SHELF_BEST_COLUMNS = EXPECTED_SHELF_BASE_COLUMNS

# "reading_now" shelf branch: base + reading_progress fields.
EXPECTED_SHELF_READING_NOW_COLUMNS = EXPECTED_SHELF_BASE_COLUMNS | {
    "fraction", "last_format", "last_read_at",
}

# "default" (regular) shelf: same as base.
EXPECTED_SHELF_DEFAULT_COLUMNS = EXPECTED_SHELF_BASE_COLUMNS

# books.get_books / books.get_book_by_id: entity-detail + id arrays + user data.
EXPECTED_BOOKS_FULL_COLUMNS = EXPECTED_ENTITY_DETAIL_COLUMNS | {
    "author_ids", "tag_ids", "rating", "is_read",
}


class TestAuthorDetailSnapshot:
    def test_author_1_shape_and_order(self, db):
        result = authors_dal.get_author_by_id(db, 1)
        assert result is not None
        books = result["books"]
        # Test Author (id=1) is tied to books 1 and 3
        assert {b["id"] for b in books} == {1, 3}
        assert len(books) == 2
        # Exact column set — guards against accidental SELECT drift.
        assert set(books[0].keys()) == EXPECTED_ENTITY_DETAIL_COLUMNS
        # Outer order (b.added_at DESC): book 3 (2025-01-03) before book 1 (2025-01-01)
        assert [b["id"] for b in books] == [3, 1]

    def test_author_100_multi_author_book(self, db_with_multi_author):
        # Author 101 (Smith) — their page should show the multi-author book.
        # After Task 3 migration: the shared fragment sorts authors alphabetically
        # by name, so the GROUP_CONCAT should be "Brown,Smith" exactly.
        result = authors_dal.get_author_by_id(db_with_multi_author, 101)
        assert result is not None
        multi_book = next(b for b in result["books"] if b["id"] == 100)
        # Was set-membership — tighten to exact string now that Task 3 wires
        # the deterministic book_list_query aggregation.
        assert multi_book["authors"] == "Brown,Smith"


class TestSeriesDetailSnapshot:
    def test_series_1_books_by_series_number(self, db):
        result = series_dal.get_series_by_id(db, 1)
        assert result is not None
        books = result["books"]
        # Books 1 (num 1) and 3 (num 2) belong to series 1
        assert [b["id"] for b in books] == [1, 3]  # ORDER BY b.series_number
        assert set(books[0].keys()) == EXPECTED_ENTITY_DETAIL_COLUMNS

    def test_series_1_book_authors_exact_string(self, db_with_multi_author):
        """Series detail page — authors of each book must be alphabetically sorted
        by name (contract preserved by shared BOOK_LIST_AGGREGATE_COLUMNS).
        Book 100 (series_number=10) is inserted with authors Smith then Brown;
        after migration the shared fragment enforces ORDER BY a.name → 'Brown,Smith'."""
        result = series_dal.get_series_by_id(db_with_multi_author, 1)
        assert result is not None
        # series 1 now has books 1 (num 1), 3 (num 2), 100 (num 10) — ordered by series_number
        book_ids = [b["id"] for b in result["books"]]
        assert book_ids == [1, 3, 100]
        multi_book = next(b for b in result["books"] if b["id"] == 100)
        assert multi_book["authors"] == "Brown,Smith"


class TestTagDetailSnapshot:
    def test_tag_1_fantasy(self, db):
        result = tags_dal.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        # Tag 1 (Фэнтези) is on books 1, 3, 5. Order: b.added_at DESC -> 5, 3, 1
        assert [b["id"] for b in books] == [5, 3, 1]
        # Tag query now includes author_ids, tag_ids, rating, is_read
        assert set(books[0].keys()) == EXPECTED_BOOKS_FULL_COLUMNS

    def test_book_5_multi_tag_membership_via_tag_1(self, db):
        # Book 5 has tags 1 ("Фэнтези") and 2 ("Классический детектив").
        # After Task 5 migration: shared BOOK_LIST_AGGREGATE_COLUMNS orders by
        # tag name; "К" (U+041A) < "Ф" (U+0424), so "Классический детектив" first.
        result = tags_dal.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        book5 = next(b for b in result["books"] if b["id"] == 5)
        assert book5["tags"] == "Классический детектив,Фэнтези"


class TestShelfDetailSnapshot:
    def test_shelf_best(self, db):
        # User 2 (reader) rated book 1 with rating=5 → book 1 on "best" shelf
        shelves = shelves_dal.get_shelves(db, 2)
        best_shelf = next(s for s in shelves if s["system_code"] == "best")
        result = shelves_dal.get_shelf_by_id(db, best_shelf["id"], 2, sort="added_desc")
        assert result is not None
        books = result["books"]
        assert [b["id"] for b in books] == [1]
        # Exact column set — shelf base (includes author_ids, tag_ids, rating, is_read)
        assert set(books[0].keys()) == EXPECTED_SHELF_BEST_COLUMNS
        assert books[0]["rating"] == 5

    def test_shelf_reading_now_empty(self, db):
        # No reading_progress for user 2 → empty list
        shelves = shelves_dal.get_shelves(db, 2)
        rn = next(s for s in shelves if s["system_code"] == "reading_now")
        result = shelves_dal.get_shelf_by_id(db, rn["id"], 2, sort="added_desc")
        assert result["books"] == []

    def test_shelf_default_empty(self, db):
        # User-created shelf (not system). Need to create one.
        shelf_id = shelves_dal.create_shelf(db, 2, "My Shelf")
        db.commit()
        result = shelves_dal.get_shelf_by_id(db, shelf_id, 2, sort="added_desc")
        assert result is not None
        assert result["books"] == []

    def test_shelf_best_multi_author_exact_string(self, db_with_multi_author):
        # Put book 100 onto user 2's "best" shelf by rating it >= 4
        db_with_multi_author.execute(
            "INSERT INTO user_books (user_id, book_id, rating) VALUES (2, 100, 5)"
        )
        db_with_multi_author.commit()
        shelves = shelves_dal.get_shelves(db_with_multi_author, 2)
        best = next(s for s in shelves if s["system_code"] == "best")
        result = shelves_dal.get_shelf_by_id(db_with_multi_author, best["id"], 2, sort="added_desc")
        multi_book = next(b for b in result["books"] if b["id"] == 100)
        assert multi_book["authors"] == "Brown,Smith"
        # Exact column set for the "best" branch (includes author_ids, tag_ids, rating, is_read).
        assert set(multi_book.keys()) == EXPECTED_SHELF_BEST_COLUMNS
        assert multi_book["rating"] == 5

    def test_shelf_reading_now_multi_author_exact_string(self, db_with_multi_author):
        # No user_books row for user 2 / book 100 — covers the `ub.is_read IS NULL`
        # branch of the reading_now WHERE filter (new reader, never marked read).
        db_with_multi_author.execute(
            "INSERT INTO reading_progress (user_id, book_id, position, fraction, last_read_at) "
            "VALUES (2, 100, '{\"kind\":\"cfi\",\"value\":\"x\"}', 0.5, '2025-01-10 12:00:00')"
        )
        db_with_multi_author.commit()
        shelves = shelves_dal.get_shelves(db_with_multi_author, 2)
        rn = next(s for s in shelves if s["system_code"] == "reading_now")
        result = shelves_dal.get_shelf_by_id(db_with_multi_author, rn["id"], 2, sort="added_desc")
        multi_book = next(b for b in result["books"] if b["id"] == 100)
        assert multi_book["authors"] == "Brown,Smith"
        # Exact column set for the "reading_now" branch (base + fraction/last_format/last_read_at).
        assert set(multi_book.keys()) == EXPECTED_SHELF_READING_NOW_COLUMNS
        assert multi_book["fraction"] == 0.5

    def test_shelf_default_multi_author_exact_string(self, db_with_multi_author):
        shelf_id = shelves_dal.create_shelf(db_with_multi_author, 2, "Test Shelf")
        shelves_dal.add_book_to_shelf(db_with_multi_author, shelf_id, 100)
        db_with_multi_author.commit()
        result = shelves_dal.get_shelf_by_id(db_with_multi_author, shelf_id, 2, sort="added_desc")
        multi_book = next(b for b in result["books"] if b["id"] == 100)
        assert multi_book["authors"] == "Brown,Smith"
        # Default shelf: base columns (author_ids, tag_ids, rating, is_read included).
        assert set(multi_book.keys()) == EXPECTED_SHELF_DEFAULT_COLUMNS


class TestBooksSnapshot:
    def test_get_books_default_order(self, db):
        resp = books_dal.get_books(db, filters={})
        # Default sort = added_desc
        book_ids = [b["id"] for b in resp["books"]]
        assert book_ids == [5, 4, 3, 2, 1]
        assert set(resp["books"][0].keys()) == EXPECTED_BOOKS_FULL_COLUMNS

    def test_get_book_by_id_shape(self, db):
        result = books_dal.get_book_by_id(db, 1)
        assert result is not None
        # Book 1 has 1 author (Test Author) and 1 tag (Фэнтези)
        assert result["authors"] == "Test Author"
        assert result["tags"] == "Фэнтези"
        # Exact column set — same as get_books row shape.
        assert set(result.keys()) == EXPECTED_BOOKS_FULL_COLUMNS

    def test_get_books_multi_author_membership(self, db_with_multi_author):
        resp = books_dal.get_books(db_with_multi_author, filters={})
        multi = next(b for b in resp["books"] if b["id"] == 100)
        assert set(multi["authors"].split(",")) == {"Smith", "Brown"}
        # Matching IDs
        assert set(multi["author_ids"].split(",")) == {"101", "102"}

    def test_get_books_multi_author_exact_string(self, db_with_multi_author):
        # Prove ORDER BY a.name inside GROUP_CONCAT: insertion order was Smith, Brown;
        # expected alphabetical is Brown, Smith. Also author_ids must pair with names
        # by the same axis — so ids should come in the same (Brown-first, Smith-second)
        # order, i.e. "102,101" — not "101,102" (which would indicate sort-by-id).
        resp = books_dal.get_books(db_with_multi_author, filters={})
        multi = next(b for b in resp["books"] if b["id"] == 100)
        assert multi["authors"] == "Brown,Smith"
        assert multi["author_ids"] == "102,101"

    def test_get_book_by_id_100_multi_author_exact_string(self, db_with_multi_author):
        result = books_dal.get_book_by_id(db_with_multi_author, 100)
        assert result is not None
        assert result["authors"] == "Brown,Smith"
        assert result["author_ids"] == "102,101"

    def test_get_books_multi_tag_exact_string(self, db_with_multi_author):
        # Book 100 has tags 1 ("Фэнтези") and 2 ("Классический детектив").
        # Alphabetical by Russian: "Классический детектив" < "Фэнтези".
        # Expected tags: "Классический детектив,Фэнтези", tag_ids: "2,1".
        resp = books_dal.get_books(db_with_multi_author, filters={})
        multi = next(b for b in resp["books"] if b["id"] == 100)
        assert multi["tags"] == "Классический детектив,Фэнтези"
        assert multi["tag_ids"] == "2,1"


def test_get_books_rating_desc_requires_user_id(db):
    """rating_desc без userId поднимает ValueError (spec: удаление fallback)."""
    with pytest.raises(ValueError, match="rating_desc requires userId"):
        books_dal.get_books(db, filters={}, sort="rating_desc")
