"""DAL-level tests for shelves and tag_books — books field as objects.

Covers:
- ShelfBookRow: authors field as list[AuthorRef], not CSV string
- ShelfBookRow: tags field as list[TagRef], not CSV string
- ShelfBookRow: series field as SeriesRef | None, not flat series_name + series_id
- TagDetailBookRow: same contract for get_tag_by_id books
- Empty authors/tags return [] not None
- Multiple authors are alphabetically sorted
- Multiple tags are alphabetically sorted
- System-shelf extra fields (rating, is_read, fraction, last_format, last_read_at)
"""
import pytest
from app.dtos._refs import AuthorRef, SeriesRef, TagRef
from app.dal import shelves as dal_shelves
from app.dal import tags as dal_tags


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _best_shelf_id(db) -> int:
    shelves = dal_shelves.get_shelves(db, 2)
    return next(s["id"] for s in shelves if s["system_code"] == "best")


def _reading_now_shelf_id(db) -> int:
    shelves = dal_shelves.get_shelves(db, 2)
    return next(s["id"] for s in shelves if s["system_code"] == "reading_now")


# ---------------------------------------------------------------------------
# TestShelfBestBooksObjects — system shelf "best" (user_books.rating >= 4)
# ---------------------------------------------------------------------------

class TestShelfBestBooksObjects:
    """get_shelf_by_id with system_code='best' must return books with object aggregates."""

    def test_authors_field_is_list_of_author_refs(self, db):
        """books[].authors must be list[AuthorRef], not a CSV string."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0, "best shelf must have at least one book (book 1 rated 5)"
        for book in books:
            assert isinstance(book["authors"], list), "authors must be a list"
            assert all(isinstance(a, AuthorRef) for a in book["authors"])

    def test_tags_field_is_list_of_tag_refs(self, db):
        """books[].tags must be list[TagRef], not a CSV string."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert isinstance(book["tags"], list), "tags must be a list"
            assert all(isinstance(t, TagRef) for t in book["tags"])

    def test_series_field_is_series_ref_or_none(self, db):
        """books[].series must be SeriesRef or None, not flat series_name column."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            series = book["series"]
            assert series is None or isinstance(series, SeriesRef), (
                f"series must be SeriesRef or None, got {type(series)}"
            )

    def test_no_series_name_flat_key(self, db):
        """series_name must not appear as a flat column."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "series_name" not in book, "series_name must be removed; use series object"

    def test_no_series_id_flat_key(self, db):
        """series_id must not appear as a flat column."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "series_id" not in book, "series_id must be removed; use series object"

    def test_no_author_ids_flat_key(self, db):
        """author_ids must not appear as a flat column after migration."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "author_ids" not in book, "author_ids must be removed; ids are inside AuthorRef.id"

    def test_no_tag_ids_flat_key(self, db):
        """tag_ids must not appear as a flat column after migration."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "tag_ids" not in book, "tag_ids must be removed; ids are inside TagRef.id"

    def test_authors_not_csv_string(self, db):
        """authors must never be a raw string."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert not isinstance(book["authors"], str), "authors must not be a CSV string"

    def test_book1_in_series(self, db):
        """Book 1 is in series 1 'Test Series' — series field must be SeriesRef."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        book1 = next((b for b in result["books"] if b["id"] == 1), None)
        assert book1 is not None, "book 1 must be on best shelf (rated 5)"
        assert isinstance(book1["series"], SeriesRef)
        assert book1["series"].id == 1
        assert book1["series"].name == "Test Series"

    def test_rating_present(self, db):
        """Best shelf rows must include rating."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "rating" in book

    def test_is_read_present(self, db):
        """Best shelf rows must include is_read."""
        result = dal_shelves.get_shelf_by_id(db, _best_shelf_id(db), 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "is_read" in book


# ---------------------------------------------------------------------------
# TestShelfReadingNowBooksObjects — system shelf "reading_now"
# ---------------------------------------------------------------------------

class TestShelfReadingNowBooksObjects:
    """get_shelf_by_id with system_code='reading_now' must return books with object aggregates."""

    @pytest.fixture
    def db_with_progress(self, db):
        """Add reading progress for book 2, user 2."""
        db.execute(
            "INSERT INTO reading_progress (user_id, book_id, position, fraction, last_format, last_read_at) "
            "VALUES (2, 2, '{\"kind\":\"cfi\",\"value\":\"x\"}', 0.3, 'fb2', '2025-06-01 10:00:00')"
        )
        db.commit()
        return db

    def test_authors_field_is_list_of_author_refs(self, db_with_progress):
        """books[].authors must be list[AuthorRef]."""
        result = dal_shelves.get_shelf_by_id(
            db_with_progress, _reading_now_shelf_id(db_with_progress), 2, sort="addedDesc"
        )
        assert result is not None
        books = result["books"]
        assert len(books) > 0, "reading_now shelf must have book 2"
        for book in books:
            assert isinstance(book["authors"], list)
            assert all(isinstance(a, AuthorRef) for a in book["authors"])

    def test_tags_field_is_list_of_tag_refs(self, db_with_progress):
        """books[].tags must be list[TagRef]."""
        result = dal_shelves.get_shelf_by_id(
            db_with_progress, _reading_now_shelf_id(db_with_progress), 2, sort="addedDesc"
        )
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert isinstance(book["tags"], list)
            assert all(isinstance(t, TagRef) for t in book["tags"])

    def test_series_field_is_series_ref_or_none(self, db_with_progress):
        """books[].series must be SeriesRef or None."""
        result = dal_shelves.get_shelf_by_id(
            db_with_progress, _reading_now_shelf_id(db_with_progress), 2, sort="addedDesc"
        )
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            series = book["series"]
            assert series is None or isinstance(series, SeriesRef)

    def test_no_series_name_flat_key(self, db_with_progress):
        """series_name must not appear as a flat column."""
        result = dal_shelves.get_shelf_by_id(
            db_with_progress, _reading_now_shelf_id(db_with_progress), 2, sort="addedDesc"
        )
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "series_name" not in book

    def test_progress_fields_present(self, db_with_progress):
        """reading_now rows must include fraction, last_format, last_read_at."""
        result = dal_shelves.get_shelf_by_id(
            db_with_progress, _reading_now_shelf_id(db_with_progress), 2, sort="addedDesc"
        )
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "fraction" in book
            assert "last_format" in book
            assert "last_read_at" in book


# ---------------------------------------------------------------------------
# TestShelfRegularBooksObjects — user-created (non-system) shelf
# ---------------------------------------------------------------------------

class TestShelfRegularBooksObjects:
    """get_shelf_by_id with regular shelf must return books with object aggregates."""

    @pytest.fixture
    def shelf_with_book(self, db):
        """Create a regular shelf with book 1."""
        shelf_id = dal_shelves.create_shelf(db, user_id=2, name="test-shelf-objects")
        dal_shelves.add_book_to_shelf(db, shelf_id, 1)
        db.commit()
        return shelf_id

    def test_authors_field_is_list_of_author_refs(self, db, shelf_with_book):
        """books[].authors must be list[AuthorRef]."""
        result = dal_shelves.get_shelf_by_id(db, shelf_with_book, 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert isinstance(book["authors"], list)
            assert all(isinstance(a, AuthorRef) for a in book["authors"])

    def test_tags_field_is_list_of_tag_refs(self, db, shelf_with_book):
        """books[].tags must be list[TagRef]."""
        result = dal_shelves.get_shelf_by_id(db, shelf_with_book, 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert isinstance(book["tags"], list)
            assert all(isinstance(t, TagRef) for t in book["tags"])

    def test_series_field_is_series_ref_or_none(self, db, shelf_with_book):
        """books[].series must be SeriesRef or None."""
        result = dal_shelves.get_shelf_by_id(db, shelf_with_book, 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            series = book["series"]
            assert series is None or isinstance(series, SeriesRef)

    def test_no_series_name_flat_key(self, db, shelf_with_book):
        """series_name must not appear as a flat column."""
        result = dal_shelves.get_shelf_by_id(db, shelf_with_book, 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "series_name" not in book

    def test_no_series_id_flat_key(self, db, shelf_with_book):
        """series_id must not appear as a flat column."""
        result = dal_shelves.get_shelf_by_id(db, shelf_with_book, 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "series_id" not in book

    def test_no_author_ids_flat_key(self, db, shelf_with_book):
        """author_ids must not appear as a flat column."""
        result = dal_shelves.get_shelf_by_id(db, shelf_with_book, 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "author_ids" not in book

    def test_no_tag_ids_flat_key(self, db, shelf_with_book):
        """tag_ids must not appear as a flat column."""
        result = dal_shelves.get_shelf_by_id(db, shelf_with_book, 2, sort="addedDesc")
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "tag_ids" not in book

    def test_book1_in_series(self, db, shelf_with_book):
        """Book 1 is in series 1 — series object must be present."""
        result = dal_shelves.get_shelf_by_id(db, shelf_with_book, 2, sort="addedDesc")
        assert result is not None
        book1 = next((b for b in result["books"] if b["id"] == 1), None)
        assert book1 is not None
        assert isinstance(book1["series"], SeriesRef)
        assert book1["series"].id == 1
        assert book1["series"].name == "Test Series"

    def test_book_without_series_has_none(self, db):
        """Book 2 has no series — series field must be None."""
        shelf_id = dal_shelves.create_shelf(db, user_id=2, name="test-shelf-noseries")
        dal_shelves.add_book_to_shelf(db, shelf_id, 2)
        db.commit()
        result = dal_shelves.get_shelf_by_id(db, shelf_id, 2, sort="addedDesc")
        assert result is not None
        book2 = next((b for b in result["books"] if b["id"] == 2), None)
        assert book2 is not None
        assert book2["series"] is None


# ---------------------------------------------------------------------------
# TestShelfMultiAuthorAlphabetical — ordering regression tests
# ---------------------------------------------------------------------------

class TestShelfMultiAuthorAlphabetical:
    """Alphabetical ordering of authors/tags in shelf rows — regression guard."""

    @pytest.fixture
    def multi_shelf_id(self, db):
        """Insert a multi-author, multi-tag book onto a regular shelf; return shelf_id."""
        db.execute("INSERT INTO authors (id, name, sort_name) VALUES (501, 'Zhukov', 'Zhukov')")
        db.execute("INSERT INTO authors (id, name, sort_name) VALUES (502, 'Adams', 'Adams')")
        db.execute(
            "INSERT INTO books (id, title, sort_title, language, added_at) "
            "VALUES (501, 'Multi-Author Shelf Book', 'Multi-Author Shelf Book', 'en', '2026-01-01 00:00:00')"
        )
        db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (501, 501)")
        db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (501, 502)")
        db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (501, 1)")
        db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (501, 2)")
        shelf_id = dal_shelves.create_shelf(db, user_id=2, name="multi-author-test")
        dal_shelves.add_book_to_shelf(db, shelf_id, 501)
        db.commit()
        return shelf_id

    def test_authors_alphabetically_sorted_on_regular_shelf(self, db, multi_shelf_id):
        """Multi-author book on regular shelf: authors must be alphabetically sorted."""
        result = dal_shelves.get_shelf_by_id(db, multi_shelf_id, 2, sort="addedDesc")
        assert result is not None
        book = next((b for b in result["books"] if b["id"] == 501), None)
        assert book is not None
        names = [a.name for a in book["authors"]]
        assert names == sorted(names), f"Authors not alphabetically sorted: {names}"
        assert names == ["Adams", "Zhukov"]

    def test_tags_alphabetically_sorted_on_regular_shelf(self, db, multi_shelf_id):
        """Multi-tag book on regular shelf: tags must be alphabetically sorted."""
        result = dal_shelves.get_shelf_by_id(db, multi_shelf_id, 2, sort="addedDesc")
        assert result is not None
        book = next((b for b in result["books"] if b["id"] == 501), None)
        assert book is not None
        names = [t.name for t in book["tags"]]
        assert names == sorted(names), f"Tags not alphabetically sorted: {names}"

    def test_authors_alphabetically_sorted_on_best_shelf(self, db, multi_shelf_id):
        """Multi-author book on best shelf: authors must be alphabetically sorted."""
        db.execute(
            "INSERT INTO user_books (user_id, book_id, rating, is_read) VALUES (2, 501, 5, 0)"
        )
        db.commit()
        shelves = dal_shelves.get_shelves(db, 2)
        best_id = next(s["id"] for s in shelves if s["system_code"] == "best")
        result = dal_shelves.get_shelf_by_id(db, best_id, 2, sort="addedDesc")
        assert result is not None
        book = next((b for b in result["books"] if b["id"] == 501), None)
        assert book is not None
        names = [a.name for a in book["authors"]]
        assert names == ["Adams", "Zhukov"]


# ---------------------------------------------------------------------------
# TestTagDetailBooksObjects — get_tag_by_id books field as objects
# ---------------------------------------------------------------------------

class TestTagDetailBooksObjects:
    """get_tag_by_id books must return list[TagDetailBookRow] with object aggregates."""

    def test_authors_field_is_list_of_author_refs(self, db):
        """books[].authors must be list[AuthorRef], not a CSV string."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0, "tag 1 (Фэнтези) must have at least one book"
        for book in books:
            assert isinstance(book["authors"], list), "authors must be a list"
            assert all(isinstance(a, AuthorRef) for a in book["authors"])

    def test_tags_field_is_list_of_tag_refs(self, db):
        """books[].tags must be list[TagRef], not a CSV string."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert isinstance(book["tags"], list), "tags must be a list"
            assert all(isinstance(t, TagRef) for t in book["tags"])

    def test_series_field_is_series_ref_or_none(self, db):
        """books[].series must be SeriesRef or None, not flat series_name column."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            series = book["series"]
            assert series is None or isinstance(series, SeriesRef), (
                f"series must be SeriesRef or None, got {type(series)}"
            )

    def test_no_series_name_flat_key(self, db):
        """series_name must not appear as a flat column."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "series_name" not in book, "series_name must be removed; use series object"

    def test_no_series_id_flat_key(self, db):
        """series_id must not appear as a flat column."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "series_id" not in book, "series_id must be removed; use series object"

    def test_no_author_ids_flat_key(self, db):
        """author_ids must not appear as a flat column."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "author_ids" not in book, "author_ids must be removed"

    def test_no_tag_ids_flat_key(self, db):
        """tag_ids must not appear as a flat column."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "tag_ids" not in book, "tag_ids must be removed"

    def test_authors_not_csv_string(self, db):
        """authors must never be a raw string."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert not isinstance(book["authors"], str), "authors must not be a CSV string"

    def test_tags_not_csv_string(self, db):
        """tags must never be a raw string."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert not isinstance(book["tags"], str), "tags must not be a CSV string"

    def test_book_in_series_has_series_ref(self, db):
        """Book 1 has series 1 'Test Series' — series field must be SeriesRef."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        book1 = next((b for b in result["books"] if b["id"] == 1), None)
        assert book1 is not None, "book 1 must be in tag 1 (Фэнтези)"
        assert isinstance(book1["series"], SeriesRef)
        assert book1["series"].id == 1
        assert book1["series"].name == "Test Series"

    def test_book_without_series_has_none(self, db):
        """Book 5 has no series — series field must be None."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        book5 = next((b for b in result["books"] if b["id"] == 5), None)
        assert book5 is not None, "book 5 must be in tag 1 (Фэнтези)"
        assert book5["series"] is None

    def test_rating_present_in_tag_books(self, db):
        """Tag books must include rating (user_books join)."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "rating" in book

    def test_is_read_present_in_tag_books(self, db):
        """Tag books must include is_read (user_books join)."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        books = result["books"]
        assert len(books) > 0
        for book in books:
            assert "is_read" in book

    def test_multi_author_alphabetical_order(self, db):
        """Multi-author tag book: authors alphabetically sorted."""
        db.execute("INSERT INTO authors (id, name, sort_name) VALUES (601, 'Zweig', 'Zweig')")
        db.execute("INSERT INTO authors (id, name, sort_name) VALUES (602, 'Balzac', 'Balzac')")
        db.execute(
            "INSERT INTO books (id, title, sort_title, language, added_at) "
            "VALUES (601, 'Multi-Author Tag Book', 'Multi-Author Tag Book', 'en', '2026-01-15 00:00:00')"
        )
        db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (601, 601)")
        db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (601, 602)")
        db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (601, 1)")
        db.commit()

        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        book = next((b for b in result["books"] if b["id"] == 601), None)
        assert book is not None
        names = [a.name for a in book["authors"]]
        assert names == sorted(names), f"Authors not alphabetically sorted: {names}"
        assert names == ["Balzac", "Zweig"]

    def test_multi_tag_alphabetical_order(self, db):
        """Book with multiple tags: tags alphabetically sorted."""
        result = dal_tags.get_tag_by_id(db, 1, user_id=2)
        assert result is not None
        book5 = next((b for b in result["books"] if b["id"] == 5), None)
        assert book5 is not None, "book 5 must have 2 tags"
        names = [t.name for t in book5["tags"]]
        assert names == sorted(names), f"Tags not alphabetically sorted: {names}"
