"""DAL-level tests for get_author_by_id and get_series_by_id — books field as objects.

Covers:
- authors field in EntityBookRow: list[AuthorRef], not CSV string
- tags field in EntityBookRow: list[TagRef], not CSV string
- series field in EntityBookRow: SeriesRef | None, not flat series_name + series_id
- Empty authors/tags return [] not None
- Multiple authors are alphabetically sorted
- Multiple tags are alphabetically sorted
"""
from app.dtos._refs import AuthorRef, SeriesRef, TagRef
from app.dal import authors as dal_authors
from app.dal import series as dal_series


def _insert_author(db, author_id: int, name: str, sort_name: str | None = None) -> None:
    db.execute(
        "INSERT INTO authors (id, name, sort_name) VALUES (?, ?, ?)",
        (author_id, name, sort_name or name),
    )


def _insert_book(
    db,
    book_id: int,
    title: str,
    *,
    series_id: int | None = None,
    series_number: float | None = None,
    added_at: str = "2026-01-01 00:00:00",
) -> None:
    if series_id is not None:
        db.execute(
            "INSERT INTO books (id, title, sort_title, language, series_id, series_number, added_at) "
            "VALUES (?, ?, ?, 'en', ?, ?, ?)",
            (book_id, title, title, series_id, series_number, added_at),
        )
    else:
        db.execute(
            "INSERT INTO books (id, title, sort_title, language, added_at) "
            "VALUES (?, ?, ?, 'en', ?)",
            (book_id, title, title, added_at),
        )


def _link_author_book(db, book_id: int, author_id: int) -> None:
    db.execute(
        "INSERT INTO book_authors (book_id, author_id) VALUES (?, ?)",
        (book_id, author_id),
    )


class TestGetAuthorBooksObjects:
    def test_authors_field_is_list_of_author_refs(self, db):
        """books[].authors must be list[AuthorRef], not a CSV string."""
        result = dal_authors.get_author_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert isinstance(book["authors"], list), "authors must be a list"
            assert all(isinstance(a, AuthorRef) for a in book["authors"])

    def test_tags_field_is_list_of_tag_refs(self, db):
        """books[].tags must be list[TagRef], not a CSV string."""
        result = dal_authors.get_author_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert isinstance(book["tags"], list), "tags must be a list"
            assert all(isinstance(t, TagRef) for t in book["tags"])

    def test_series_field_is_series_ref_or_none(self, db):
        """books[].series must be SeriesRef or None, not a flat series_name column."""
        result = dal_authors.get_author_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        # Author 1 has book 1 (series 1) and book 3 (series 1)
        for book in result["books"]:
            series = book["series"]
            assert series is None or isinstance(series, SeriesRef), (
                f"series must be SeriesRef or None, got {type(series)}"
            )

    def test_no_series_name_flat_key(self, db):
        """series_name must no longer appear as a flat column in EntityBookRow."""
        result = dal_authors.get_author_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert "series_name" not in book, "series_name must be removed; use series object"

    def test_no_series_id_flat_key(self, db):
        """series_id must no longer appear as a flat column in EntityBookRow."""
        result = dal_authors.get_author_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert "series_id" not in book, "series_id must be removed; use series object"

    def test_authors_not_csv_string(self, db):
        """authors must never be a raw string."""
        result = dal_authors.get_author_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert not isinstance(book["authors"], str), "authors must not be a CSV string"

    def test_tags_not_csv_string(self, db):
        """tags must never be a raw string."""
        result = dal_authors.get_author_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert not isinstance(book["tags"], str), "tags must not be a CSV string"

    def test_book_in_series_has_series_ref(self, db):
        """Book 1 belongs to series 1 (Test Series) — series field must be SeriesRef."""
        result = dal_authors.get_author_by_id(db, 1, 2)
        assert result is not None
        book1 = next(b for b in result["books"] if b["id"] == 1)
        assert isinstance(book1["series"], SeriesRef)
        assert book1["series"].name == "Test Series"
        assert book1["series"].id == 1

    def test_multi_author_alphabetical_order(self, db):
        """Authors for a multi-author book must appear alphabetically by name."""
        _insert_author(db, 201, "Smith")
        _insert_author(db, 202, "Brown")
        _insert_book(db, 201, "Multi-Author Book")
        _link_author_book(db, 201, 201)
        _link_author_book(db, 201, 202)
        db.commit()

        result = dal_authors.get_author_by_id(db, 201, 2)
        assert result is not None
        book = next(b for b in result["books"] if b["id"] == 201)
        names = [a.name for a in book["authors"]]
        assert names == sorted(names), f"Authors not alphabetically sorted: {names}"
        assert names == ["Brown", "Smith"]

    def test_book_without_tags_has_empty_list(self, db):
        """Book with no tags must return tags == []."""
        _insert_author(db, 210, "Tagless Author", sort_name="Author, Tagless")
        _insert_book(db, 210, "Tagless Book", added_at="2026-01-10 00:00:00")
        _link_author_book(db, 210, 210)
        db.commit()

        result = dal_authors.get_author_by_id(db, 210, 2)
        assert result is not None
        book = result["books"][0]
        assert book["tags"] == []

    def test_book_without_series_has_none(self, db):
        """Book not in any series must return series == None."""
        _insert_author(db, 211, "Standalone Author", sort_name="Author, Standalone")
        _insert_book(db, 211, "Standalone Book", added_at="2026-01-11 00:00:00")
        _link_author_book(db, 211, 211)
        db.commit()

        result = dal_authors.get_author_by_id(db, 211, 2)
        assert result is not None
        book = result["books"][0]
        assert book["series"] is None


class TestGetSeriesBooksObjects:
    def test_authors_field_is_list_of_author_refs(self, db):
        """books[].authors must be list[AuthorRef], not a CSV string."""
        result = dal_series.get_series_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert isinstance(book["authors"], list), "authors must be a list"
            assert all(isinstance(a, AuthorRef) for a in book["authors"])

    def test_tags_field_is_list_of_tag_refs(self, db):
        """books[].tags must be list[TagRef], not a CSV string."""
        result = dal_series.get_series_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert isinstance(book["tags"], list), "tags must be a list"
            assert all(isinstance(t, TagRef) for t in book["tags"])

    def test_series_field_is_series_ref(self, db):
        """books[].series must be SeriesRef for books in a series."""
        result = dal_series.get_series_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            # All books in series 1 belong to that series
            assert isinstance(book["series"], SeriesRef)
            assert book["series"].id == 1

    def test_no_series_name_flat_key(self, db):
        """series_name must no longer appear as a flat column."""
        result = dal_series.get_series_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert "series_name" not in book, "series_name must be removed; use series object"

    def test_no_series_id_flat_key(self, db):
        """series_id must no longer appear as a flat column."""
        result = dal_series.get_series_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert "series_id" not in book, "series_id must be removed; use series object"

    def test_authors_not_csv_string(self, db):
        """authors must never be a raw string."""
        result = dal_series.get_series_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert not isinstance(book["authors"], str), "authors must not be a CSV string"

    def test_tags_not_csv_string(self, db):
        """tags must never be a raw string."""
        result = dal_series.get_series_by_id(db, 1, 2)
        assert result is not None
        assert len(result["books"]) > 0
        for book in result["books"]:
            assert not isinstance(book["tags"], str), "tags must not be a CSV string"

    def test_multi_author_alphabetical_order(self, db):
        """Multi-author books in a series have authors alphabetically sorted."""
        _insert_author(db, 301, "Zola")
        _insert_author(db, 302, "Aragon")
        _insert_book(db, 301, "Series Multi-Author", series_id=1, series_number=99, added_at="2026-01-20 00:00:00")
        _link_author_book(db, 301, 301)
        _link_author_book(db, 301, 302)
        db.commit()

        result = dal_series.get_series_by_id(db, 1, 2)
        assert result is not None
        book = next(b for b in result["books"] if b["id"] == 301)
        names = [a.name for a in book["authors"]]
        assert names == ["Aragon", "Zola"]

    def test_series_books_ordered_by_series_number(self, db):
        """Books in a series must be ordered by series_number."""
        result = dal_series.get_series_by_id(db, 1, 2)
        assert result is not None
        books = result["books"]
        # Books 1 (series_number=1) and 3 (series_number=2) in series 1
        assert [b["id"] for b in books] == [1, 3]


class TestEntityDetailAggregates:
    """Жанры автора и авторы серии в детальных ответах (23od).

    В списках эти сведения есть (get_authors отдаёт tags, get_series — authors),
    в детальных запросах их не собирали, и вторая половина строки под заголовком
    на странице автора и серии оставалась пустой.
    """

    def test_author_detail_has_tags(self, db):
        """Автор 1: книги 1 и 3, у обеих тег «Фэнтези»."""
        result = dal_authors.get_author_by_id(db, 1, 2)
        assert result is not None
        assert [(t.id, t.name) for t in result["author"]["tags"]] == [(1, "Фэнтези")]

    def test_author_detail_tags_are_deduplicated(self, db):
        """Один тег у двух книг автора — в агрегате он один раз."""
        result = dal_authors.get_author_by_id(db, 1, 2)
        tag_ids = [t.id for t in result["author"]["tags"]]
        assert len(tag_ids) == len(set(tag_ids))

    def test_author_detail_tags_sorted_by_name(self, db):
        """Автор 2: книга 2 (тег 2) и книга 5 (теги 1 и 2) — порядок по имени."""
        result = dal_authors.get_author_by_id(db, 2, 2)
        names = [t.name for t in result["author"]["tags"]]
        assert len(names) == 2
        assert names == sorted(names)

    def test_author_detail_tags_match_list_endpoint(self, db):
        """Деталь и список говорят об авторе одно и то же."""
        detail = dal_authors.get_author_by_id(db, 1, 2)
        listed = dal_authors.get_authors(db, user_id=2)
        listed_author = next(a for a in listed["authors"] if a["id"] == 1)
        assert detail["author"]["tags"] == listed_author["tags"]

    def test_author_without_books_has_empty_tags(self, db):
        """json_group_array на пустом наборе даёт '[]' — не None и не падение."""
        _insert_author(db, 900, "Одинокий Автор")
        db.commit()

        result = dal_authors.get_author_by_id(db, 900, 2)
        assert result is not None
        assert result["author"]["tags"] == []

    def test_series_detail_has_authors(self, db):
        """Серия 1: книги 1 и 3, обе автора 1."""
        result = dal_series.get_series_by_id(db, 1, 2)
        assert result is not None
        assert [(a.id, a.name) for a in result["series"]["authors"]] == [(1, "Test Author")]

    def test_series_detail_authors_are_deduplicated(self, db):
        """Один автор у двух книг серии — в агрегате он один раз."""
        result = dal_series.get_series_by_id(db, 1, 2)
        author_ids = [a.id for a in result["series"]["authors"]]
        assert len(author_ids) == len(set(author_ids))

    def test_series_detail_authors_match_list_endpoint(self, db):
        detail = dal_series.get_series_by_id(db, 1, 2)
        listed = dal_series.get_series(db, user_id=2)
        listed_series = next(s for s in listed["series"] if s["id"] == 1)
        assert detail["series"]["authors"] == listed_series["authors"]
