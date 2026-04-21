"""Unit tests for dal.sort and config.sort."""
from typing import get_args

import pytest

from app.config.sort import SORT_CONFIG
from app.dal.sort import UserSort, resolve_order_clause


class TestSortConfig:
    def test_has_all_page_configs(self):
        for key in ("catalog", "tag", "shelf_best", "shelf_reading_now", "shelf_regular", "labels"):
            assert key in SORT_CONFIG

    def test_reading_now_has_empty_options(self):
        assert SORT_CONFIG["shelf_reading_now"]["options"] == []
        assert SORT_CONFIG["shelf_reading_now"]["default"] == "last_read_desc"

    def test_labels_cover_all_sort_keys(self):
        labels = SORT_CONFIG["labels"]
        user_keys = set(get_args(UserSort))
        for k in user_keys:
            assert k in labels, f"missing label for {k}"
        assert "last_read_desc" in labels


class TestUserSort:
    def test_eight_keys_no_last_read_desc(self):
        keys = set(get_args(UserSort))
        assert len(keys) == 8
        assert "last_read_desc" not in keys


class TestResolveOrderClause:
    def test_all_user_sort_keys_resolve(self):
        for k in get_args(UserSort):
            clause = resolve_order_clause(k)
            assert clause.startswith("ORDER BY ")

    def test_last_read_desc_resolves(self):
        clause = resolve_order_clause("last_read_desc")
        assert "rp.last_read_at DESC" in clause

    def test_rating_desc_has_nulls_last(self):
        clause = resolve_order_clause("rating_desc")
        assert "NULLS LAST" in clause

    def test_author_asc_uses_min_aggregate(self):
        clause = resolve_order_clause("author_asc")
        assert "MIN(a.sort_name)" in clause
