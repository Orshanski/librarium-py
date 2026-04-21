"""Tests for shared filter utilities: build_book_where."""


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
        where, params = build_book_where({"language": ["Русский"]})
        assert "b.language IN (:l0)" in where
        assert params["l0"] == "Русский"

    def test_language_filter_multi(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where({"language": ["ru", "en"]})
        assert "b.language IN (:l0,:l1)" in where
        assert params["l0"] == "ru"
        assert params["l1"] == "en"

    def test_exclude_language(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where(
            {"authorIds": [1], "language": ["ru"]}, exclude="language"
        )
        assert "language" not in where
        assert "l0" not in params
        assert "book_authors" in where

    def test_language_filter_multi_unicode(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where({"language": ["Русский", "English"]})
        assert "b.language IN (:l0,:l1)" in where
        assert params["l0"] == "Русский"
        assert params["l1"] == "English"

    def test_user_hidden_filter(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where({"userId": 5})
        assert "is_hidden" in where
        assert params["uid"] == 5

    def test_exclude_key(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where(
            {"authorIds": [1], "language": ["Русский"]}, exclude="authorIds"
        )
        assert "book_authors" not in where
        assert "b.language IN (:l0)" in where
        assert params["l0"] == "Русский"

    def test_combined_filters(self):
        from app.dal.filters import build_book_where
        where, params = build_book_where(
            {"authorIds": [1], "tagIds": [2], "language": ["English"]}
        )
        assert "book_authors" in where
        assert "book_tags" in where
        assert "b.language IN (:l0)" in where
        assert params["l0"] == "English"

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
            {"language": ["Русский"]},
            extra_clauses=[("bt2.tag_id = :id", {"id": 7})]
        )
        assert "bt2.tag_id = :id" in where
        assert "b.language IN (:l0)" in where
        assert params["id"] == 7
        assert params["l0"] == "Русский"
