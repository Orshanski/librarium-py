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


