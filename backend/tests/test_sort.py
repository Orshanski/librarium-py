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
        assert SORT_CONFIG["shelf_reading_now"]["default"] == "lastReadDesc"

    def test_labels_cover_all_sort_keys(self):
        labels = SORT_CONFIG["labels"]
        user_keys = set(get_args(UserSort))
        for k in user_keys:
            assert k in labels, f"missing label for {k}"
        assert "lastReadDesc" in labels


class TestUserSort:
    def test_eight_keys_no_lastReadDesc(self):
        keys = set(get_args(UserSort))
        assert len(keys) == 8
        assert "lastReadDesc" not in keys


class TestResolveOrderClause:
    def test_all_user_sort_keys_resolve(self):
        for k in get_args(UserSort):
            clause = resolve_order_clause(k)
            assert clause.startswith("ORDER BY ")

    def test_lastReadDesc_resolves(self):
        clause = resolve_order_clause("lastReadDesc")
        assert "rp.last_read_at DESC" in clause

    def test_ratingDesc_has_nulls_last(self):
        clause = resolve_order_clause("ratingDesc")
        assert "NULLS LAST" in clause

    def test_authorAsc_uses_min_aggregate(self):
        clause = resolve_order_clause("authorAsc")
        assert "MIN(a.sort_name)" in clause


class TestSortIntegration:
    def test_books_sort_addedDesc(self, reader_client):
        r = reader_client.get("/api/books?sort=addedDesc")
        assert r.status_code == 200

    def test_books_sort_unknown_422(self, reader_client):
        r = reader_client.get("/api/books?sort=unknown")
        assert r.status_code == 422

    def test_books_lastReadDesc_rejected_422(self, reader_client):
        # lastReadDesc не в UserSort → FastAPI возвращает 422
        r = reader_client.get("/api/books?sort=lastReadDesc")
        assert r.status_code == 422

    def test_books_all_eight_sorts_ok(self, reader_client):
        for s in ["addedDesc", "addedAsc", "titleAsc", "titleDesc",
                  "authorAsc", "authorDesc", "ratingDesc", "ratingAsc"]:
            r = reader_client.get(f"/api/books?sort={s}")
            assert r.status_code == 200, f"{s} returned {r.status_code}"

    def test_shelf_sort_applies(self, reader_client, regular_shelf_id):
        r = reader_client.get(f"/api/shelves/{regular_shelf_id}?sort=titleAsc")
        assert r.status_code == 200
        titles = [b["title"] for b in r.json()["books"]]
        assert titles == sorted(titles, key=lambda t: t.lower())

    def test_shelf_lastReadDesc_rejected_422(self, reader_client, regular_shelf_id):
        # `lastReadDesc` на обычной shelf — 422 (не в UserSort)
        r = reader_client.get(f"/api/shelves/{regular_shelf_id}?sort=lastReadDesc")
        assert r.status_code == 422

    def test_shelf_reading_now_ignores_user_sort(self, reader_client, reading_now_shelf_id):
        # Reading_now shelf: даже если user передал sort=titleAsc, DAL
        # внутренне override'ит на lastReadDesc.
        r1 = reader_client.get(f"/api/shelves/{reading_now_shelf_id}?sort=titleAsc")
        r2 = reader_client.get(f"/api/shelves/{reading_now_shelf_id}")  # без sort
        assert r1.status_code == 200 and r2.status_code == 200
        assert [b["id"] for b in r1.json()["books"]] == [b["id"] for b in r2.json()["books"]]

    def test_tag_sort_applies(self, reader_client, tag_id):
        r = reader_client.get(f"/api/tags/{tag_id}?sort=ratingDesc")
        assert r.status_code == 200

    def test_tag_lastReadDesc_rejected_422(self, reader_client, tag_id):
        r = reader_client.get(f"/api/tags/{tag_id}?sort=lastReadDesc")
        assert r.status_code == 422

    def test_shelf_sort_authorAsc_orders_by_first_author(self, reader_client, regular_shelf_id):
        # Проверка нетривиального MIN(a.sort_name) — по первому автору
        # алфавитно по sort_name. Фикстура: книга 1 → sort_name="Author, Test",
        # книга 2 → sort_name="Writer, Cover". ASC даёт порядок: книга 1, книга 2.
        r = reader_client.get(f"/api/shelves/{regular_shelf_id}?sort=authorAsc")
        assert r.status_code == 200
        book_ids = [b["id"] for b in r.json()["books"]]
        # "Author, Test" < "Writer, Cover" → book 1 первой, book 2 второй
        assert book_ids == [1, 2]
