"""Поиск в каталоге OPDS: группы «Авторы», «Серии», «Книги»."""
import pytest

from tests._helpers.opds import FEED_TYPE, assert_valid_feed


@pytest.fixture
def search(anon_client, opds_headers):
    def _search(**params):
        resp = anon_client.get("/opds/search", params=params, headers=opds_headers)
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == FEED_TYPE
        feed = resp.json()
        assert_valid_feed(feed)
        return feed

    return _search


def _groups(feed):
    return {g["metadata"]["title"]: g for g in feed["groups"]}


def test_groups_authors_series_books(search):
    feed = search(query="Test")
    assert feed["metadata"]["title"] == "Поиск: Test"
    assert [link for link in feed["links"] if link["rel"] == "self"] == [
        {"rel": "self", "href": "/opds/search?query=Test", "type": FEED_TYPE},
    ]
    groups = _groups(feed)
    assert list(groups) == ["Авторы", "Серии", "Книги"]
    assert [(n["href"], n["properties"]["numberOfItems"]) for n in groups["Авторы"]["navigation"]] == [
        ("/opds/authors/1", 2), ("/opds/authors/3", 1),
    ]
    assert [(n["href"], n["properties"]["numberOfItems"]) for n in groups["Серии"]["navigation"]] == [
        ("/opds/series/1", 2), ("/opds/series/2", 1),
    ]
    # Из найденных книг 1, 3, 4 файл есть только у первой
    assert [p["metadata"]["title"] for p in groups["Книги"]["publications"]] == ["Minimal Test Book"]


def test_empty_group_is_omitted(search):
    groups = _groups(search(query="Cover"))
    assert list(groups) == ["Авторы", "Книги"]


@pytest.mark.parametrize("params", [{"query": "zzzzqqq"}, {"query": "  "}, {}], ids=["no-match", "blank", "absent"])
def test_empty_result_is_empty_feed(search, params):
    feed = search(**params)
    assert feed["groups"] == []
    assert feed["metadata"]["title"]
