"""Unit tests for filters_service.build_catalog_filters."""
from app.services.filters_service import build_catalog_filters


def test_build_catalog_filters_empty():
    result = build_catalog_filters()
    assert result == {}


def test_build_catalog_filters_only_author_ids():
    result = build_catalog_filters(author_ids=[10, 20])
    assert result == {"authorIds": [10, 20]}


def test_build_catalog_filters_only_tag_ids():
    result = build_catalog_filters(tag_ids=[5])
    assert result == {"tagIds": [5]}


def test_build_catalog_filters_only_series_ids():
    result = build_catalog_filters(series_ids=[7, 8, 9])
    assert result == {"seriesIds": [7, 8, 9]}


def test_build_catalog_filters_only_language():
    result = build_catalog_filters(language=["ru"])
    assert result == {"language": ["ru"]}


def test_build_catalog_filters_all_combined():
    result = build_catalog_filters(
        author_ids=[1],
        tag_ids=[2],
        series_ids=[3],
        language=["en"],
    )
    assert result == {
        "authorIds": [1],
        "tagIds": [2],
        "seriesIds": [3],
        "language": ["en"],
    }


def test_build_catalog_filters_empty_lists_treated_as_absent():
    result = build_catalog_filters(author_ids=[], tag_ids=[], series_ids=[])
    assert result == {}


def test_build_catalog_filters_none_language_absent():
    result = build_catalog_filters(language=None)
    assert result == {}


def test_build_catalog_filters_empty_language_absent():
    # Empty list is falsy, should not produce a "language" key
    result = build_catalog_filters(language=[])
    assert result == {}
