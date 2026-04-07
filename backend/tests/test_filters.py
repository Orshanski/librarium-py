"""Tests for shared filter utilities: build_book_where and parse_ids."""


class TestParseIds:
    def test_empty_string(self):
        from app.routers.params import parse_ids
        assert parse_ids("") is None

    def test_single_id(self):
        from app.routers.params import parse_ids
        assert parse_ids("5") == [5]

    def test_multiple_ids(self):
        from app.routers.params import parse_ids
        assert parse_ids("1,2,3") == [1, 2, 3]

    def test_ignores_non_numeric(self):
        from app.routers.params import parse_ids
        assert parse_ids("1,abc,3") == [1, 3]

    def test_whitespace(self):
        from app.routers.params import parse_ids
        assert parse_ids(" 1 , 2 ") == [1, 2]

    def test_all_non_numeric(self):
        from app.routers.params import parse_ids
        assert parse_ids("abc,def") is None


class TestBuildBookWhere:
    def test_empty_filters(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where({})
        assert where == ""
        assert params == {}

    def test_author_filter(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where({"authorIds": [1, 2]})
        assert "book_authors" in where
        assert params["a0"] == 1
        assert params["a1"] == 2

    def test_tag_filter(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where({"tagIds": [3]})
        assert "book_tags" in where
        assert params["t0"] == 3

    def test_series_filter(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where({"seriesIds": [1]})
        assert "series_id" in where
        assert params["s0"] == 1

    def test_language_filter(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where({"language": "Русский"})
        assert "language" in where
        assert params["lang"] == "Русский"

    def test_user_hidden_filter(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where({"userId": 5})
        assert "is_hidden" in where
        assert params["uid"] == 5

    def test_exclude_key(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where(
            {"authorIds": [1], "language": "Русский"}, exclude="authorIds"
        )
        assert "book_authors" not in where
        assert "language" in where

    def test_combined_filters(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where(
            {"authorIds": [1], "tagIds": [2], "language": "English"}
        )
        assert "book_authors" in where
        assert "book_tags" in where
        assert "language" in where

    def test_extra_clauses(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where(
            {}, extra_clauses=[("bt2.tag_id = :id", {"id": 42})]
        )
        assert "bt2.tag_id = :id" in where
        assert params["id"] == 42

    def test_extra_clauses_with_filters(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where(
            {"language": "Русский"},
            extra_clauses=[("bt2.tag_id = :id", {"id": 7})]
        )
        assert "bt2.tag_id = :id" in where
        assert "language" in where
        assert params["id"] == 7
        assert params["lang"] == "Русский"


class TestGetFilterCounts:
    def test_author_counts(self, reader_client):
        from app.dal.filters import get_filter_counts
        result = get_filter_counts({}, "author")
        assert len(result) > 0
        assert "id" in result[0]
        assert "name" in result[0]
        assert "count" in result[0]

    def test_tag_counts(self, reader_client):
        from app.dal.filters import get_filter_counts
        result = get_filter_counts({}, "tag")
        assert len(result) > 0
        assert "id" in result[0]
        assert "name" in result[0]
        assert "count" in result[0]

    def test_series_counts(self, reader_client):
        from app.dal.filters import get_filter_counts
        result = get_filter_counts({}, "series")
        assert len(result) > 0
        assert "id" in result[0]

    def test_language_counts(self, reader_client):
        from app.dal.filters import get_filter_counts
        result = get_filter_counts({}, "language")
        assert len(result) > 0
        assert "name" in result[0]
        assert "count" in result[0]
        assert "id" not in result[0]

    def test_sorted_alphabetically(self, reader_client):
        from app.dal.filters import get_filter_counts
        # Tags are sorted by name (no sort_name)
        result = get_filter_counts({}, "tag")
        names = [r["name"] for r in result]
        assert names == sorted(names, key=str.lower)

    def test_exclude_self(self, reader_client):
        from app.dal.filters import get_filter_counts
        # With author filter, author counts should still show all authors
        all_authors = get_filter_counts({}, "author")
        filtered = get_filter_counts({"authorIds": [1]}, "author")
        # Exclude means the author filter is ignored for author counts
        assert len(filtered) == len(all_authors)
