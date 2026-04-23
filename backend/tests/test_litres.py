"""Tests for litres.py field-extractor functions and _build_result / _process_item."""

import json
from pathlib import Path
from unittest.mock import patch
import pytest

from app.providers.litres import (
    _build_result,
    _clean_title,
    _extract_authors,
    _extract_cover_url,
    _extract_description,
    _extract_isbn,
    _extract_pub_date,
    _extract_tags,
    _process_item,
)

FIXTURES = Path(__file__).parent / "fixtures" / "litres"


@pytest.fixture
def search_instance() -> dict:
    with open(FIXTURES / "search_instance.json", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def arts_detail() -> dict:
    with open(FIXTURES / "arts_detail.json", encoding="utf-8") as f:
        return json.load(f)


# ── TestCleanTitle ──

class TestCleanTitle:
    def test_pdf_suffix_removed(self):
        assert _clean_title("Book (pdf)") == "Book"

    def test_epub_suffix_removed(self):
        assert _clean_title("Book (epub, 2020)") == "Book"

    def test_fb2_suffix_removed(self):
        assert _clean_title("Book (fb2)") == "Book"

    def test_mobi_suffix_removed(self):
        assert _clean_title("Book (mobi)") == "Book"

    def test_case_insensitive(self):
        assert _clean_title("Book (PDF)") == "Book"

    def test_no_suffix_unchanged(self):
        assert _clean_title("Book") == "Book"

    def test_whitespace_stripped(self):
        assert _clean_title("  Book  (pdf)  ") == "Book"

    def test_only_suffix_becomes_empty(self):
        assert _clean_title("(pdf)") == ""

    def test_epub_with_extra_words_inside(self):
        assert _clean_title("Book (pdf version)") == "Book"

    def test_empty_string(self):
        assert _clean_title("") == ""

    def test_none_treated_as_empty(self):
        assert _clean_title(None) == ""


# ── TestExtractAuthors ──

class TestExtractAuthors:
    def test_single_author(self):
        persons = [{"full_name": "Ivan Ivanov", "role": "author"}]
        assert _extract_authors(persons) == ["Ivan Ivanov"]

    def test_painters_filtered_out(self):
        persons = [{"full_name": "Painter One", "role": "painter"}]
        assert _extract_authors(persons) == []

    def test_translator_filtered_out(self):
        persons = [{"full_name": "Translator", "role": "translator"}]
        assert _extract_authors(persons) == []

    def test_author_translator_painter_only_author_returned(self):
        persons = [
            {"full_name": "Author Name", "role": "author"},
            {"full_name": "Translator Name", "role": "translator"},
            {"full_name": "Painter Name", "role": "painter"},
        ]
        assert _extract_authors(persons) == ["Author Name"]

    def test_role_avtor_russian(self):
        persons = [{"full_name": "Автор Книги", "role": "автор"}]
        assert _extract_authors(persons) == ["Автор Книги"]

    def test_empty_role_included(self):
        persons = [{"full_name": "Unknown Role", "role": ""}]
        assert _extract_authors(persons) == ["Unknown Role"]

    def test_none_role_included(self):
        persons = [{"full_name": "No Role", "role": None}]
        assert _extract_authors(persons) == ["No Role"]

    def test_fullname_key_fallback(self):
        persons = [{"fullName": "Full Name Key", "role": "author"}]
        assert _extract_authors(persons) == ["Full Name Key"]

    def test_name_key_fallback(self):
        persons = [{"name": "Name Key", "role": "author"}]
        assert _extract_authors(persons) == ["Name Key"]

    def test_empty_name_filtered(self):
        persons = [{"full_name": "", "role": "author"}]
        assert _extract_authors(persons) == []

    def test_empty_persons_list(self):
        assert _extract_authors([]) == []

    def test_none_persons_list(self):
        assert _extract_authors(None) == []

    def test_non_list_persons_returns_empty(self):
        """API drift защита: если persons вдруг string/dict/int → [] без падения."""
        assert _extract_authors("not a list") == []  # type: ignore[arg-type]
        assert _extract_authors({"oops": "dict"}) == []  # type: ignore[arg-type]
        assert _extract_authors(42) == []  # type: ignore[arg-type]


# ── TestExtractISBN ──

class TestExtractISBN:
    def test_isbn_with_dashes_cleaned(self):
        assert _extract_isbn({"isbn": "978-5-389-32504-3"}) == "9785389325043"

    def test_isbn13_fallback(self):
        assert _extract_isbn({"isbn": None, "isbn13": "9785"}) == "9785"

    def test_empty_when_no_isbn(self):
        assert _extract_isbn({}) == ""

    def test_isbn_none_isbn13_none(self):
        assert _extract_isbn({"isbn": None, "isbn13": None}) == ""

    def test_isbn_without_dashes_unchanged(self):
        assert _extract_isbn({"isbn": "9785389325043"}) == "9785389325043"

    def test_isbn_from_arts_detail_fixture(self, arts_detail):
        """arts_detail has isbn '978-5-389-32504-3' → cleaned to '9785389325043'."""
        assert _extract_isbn(arts_detail) == "9785389325043"

    def test_isbn_int_value_coerced_to_str(self):
        """API может вернуть isbn как int — str()-coerce обрабатывает."""
        assert _extract_isbn({"isbn": 9785389325043}) == "9785389325043"


class TestBuildResultIsbnFallback:
    """isbn fallback с item на detailed (Литрес отдаёт isbn только в /arts/{id})."""

    def test_isbn_from_detailed_when_item_empty(self):
        item = {"id": 1, "title": "X"}
        detailed = {"isbn": "978-5-000-00000-0"}
        result = _build_result(item, detailed)
        assert result is not None
        assert result.isbn == "9785000000000"

    def test_isbn_from_item_takes_precedence(self):
        item = {"id": 1, "title": "X", "isbn": "111"}
        detailed = {"isbn": "222"}
        result = _build_result(item, detailed)
        assert result is not None
        assert result.isbn == "111"

    def test_isbn_empty_when_neither_has(self):
        item = {"id": 1, "title": "X"}
        detailed = {"other": "data"}
        result = _build_result(item, detailed)
        assert result is not None
        assert result.isbn == ""


# ── TestExtractPubDate ──

class TestExtractPubDate:
    def test_date_written_at(self):
        assert _extract_pub_date({"date_written_at": "2024-01-01"}) == "2024"

    def test_first_published_at_fallback(self):
        assert _extract_pub_date({"date_written_at": None, "first_published_at": "2020-05"}) == "2020"

    def test_release_date_fallback(self):
        assert _extract_pub_date({"release_date": "2018"}) == "2018"

    def test_all_none_returns_empty(self):
        assert _extract_pub_date({}) == ""

    def test_value_without_four_digits_skips_to_next(self):
        assert _extract_pub_date({"date_written_at": "abc", "first_published_at": "2021-06"}) == "2021"

    def test_priority_date_written_at_over_others(self):
        assert _extract_pub_date({
            "date_written_at": "2024-01-01",
            "first_published_at": "2019-01-01",
            "release_date": "2015-01-01",
        }) == "2024"


# ── TestExtractTags ──

class TestExtractTags:
    def test_three_tags(self):
        detailed = {"tags": [{"name": "tag1"}, {"name": "tag2"}, {"name": "tag3"}]}
        assert _extract_tags(detailed) == ["tag1", "tag2", "tag3"]

    def test_none_detailed_returns_empty(self):
        assert _extract_tags(None) == []

    def test_missing_tags_key_returns_empty(self):
        assert _extract_tags({}) == []

    def test_tag_without_name_filtered(self):
        detailed = {"tags": [{"name": "valid"}, {"other": "no name"}]}
        assert _extract_tags(detailed) == ["valid"]

    def test_empty_tags_list(self):
        assert _extract_tags({"tags": []}) == []


# ── TestExtractDescription ──

class TestExtractDescription:
    def test_annotation_from_item_no_detailed(self):
        item = {"annotation": "Some annotation text"}
        assert _extract_description(item, None) == "Some annotation text"

    def test_description_fallback_no_detailed(self):
        item = {"description": "Description fallback"}
        assert _extract_description(item, None) == "Description fallback"

    def test_detailed_html_annotation_replaces_item_annotation(self):
        item = {"annotation": "Old annotation"}
        detailed = {"html_annotation": "<p>New HTML annotation</p>"}
        assert _extract_description(item, detailed) == "<p>New HTML annotation</p>"

    def test_ad_paragraph_removed(self):
        item = {}
        detailed = {"html_annotation": "<p>Good content</p><p>Купить в формате pdf и epub</p><p>More content</p>"}
        result = _extract_description(item, detailed)
        assert "Купить" not in result
        assert "Good content" in result
        assert "More content" in result

    def test_clean_paragraph_not_removed(self):
        item = {}
        detailed = {"html_annotation": "<p>This is a clean paragraph without ad words</p>"}
        result = _extract_description(item, detailed)
        assert "clean paragraph" in result

    def test_no_html_annotation_in_detailed_keeps_item_annotation(self):
        item = {"annotation": "Item annotation"}
        detailed = {"other_field": "something"}
        result = _extract_description(item, detailed)
        assert result == "Item annotation"

    def test_scachat_word_removed(self):
        item = {}
        detailed = {"html_annotation": "<p>Normal text</p><p>Скачать книгу в форматах</p>"}
        result = _extract_description(item, detailed)
        assert "Скачать" not in result
        assert "Normal text" in result


# ── TestExtractCoverUrl ──

class TestExtractCoverUrl:
    def test_cover_url_gets_meta_url_prefix(self):
        item = {"cover_url": "/pub/c/cover/123.jpg"}
        assert _extract_cover_url(item) == "https://www.litres.ru/pub/c/cover/123.jpg"

    def test_image_key_fallback(self):
        item = {"image": "/pub/c/img/456.jpg"}
        assert _extract_cover_url(item) == "https://www.litres.ru/pub/c/img/456.jpg"

    def test_empty_when_no_cover(self):
        assert _extract_cover_url({}) == ""

    def test_empty_string_cover_url_returns_empty(self):
        assert _extract_cover_url({"cover_url": ""}) == ""


# ── TestBuildResultEdgeCases ──

class TestBuildResultEdgeCases:
    def test_no_id_no_uuid_returns_none(self):
        assert _build_result({"title": "Some Title"}, None) is None

    def test_empty_title_returns_none(self):
        assert _build_result({"id": 1, "title": ""}, None) is None

    def test_title_only_pdf_suffix_becomes_empty_returns_none(self):
        assert _build_result({"id": 1, "title": "(pdf)"}, None) is None

    def test_uuid_used_when_no_id(self):
        item = {"uuid": "some-uuid", "title": "Book Title"}
        result = _build_result(item, None)
        assert result is not None
        assert result.title == "Book Title"

    def test_source_always_litres(self):
        item = {"id": 42, "title": "Test"}
        result = _build_result(item, None)
        assert result.source == "Litres"

    def test_publisher_empty_when_none(self):
        item = {"id": 1, "title": "Book", "publisher": None}
        result = _build_result(item, None)
        assert result.publisher == ""


# ── TestBuildResultLiveFixture ──

class TestBuildResultLiveFixture:
    def test_build_result_with_detailed(self, search_instance, arts_detail):
        result = _build_result(search_instance, arts_detail)
        assert result is not None
        assert result.title == "Архив Буресвета. Книга 5. Ветер и Правда. Том 1"
        assert result.authors == "Брендон Сандерсон"
        # isbn отсутствует в search_instance, берётся fallback из arts_detail
        assert result.isbn == "9785389325043"
        assert result.pubDate == "2024"
        assert result.source == "Litres"
        assert result.coverUrl.startswith("https://www.litres.ru")
        assert result.coverUrl.endswith(".jpg")
        tags = result.tags.split(", ")
        assert len(tags) == 6
        assert result.description != ""
        assert result.publisher == ""

    def test_build_result_without_detailed(self, search_instance):
        result = _build_result(search_instance, None)
        assert result is not None
        assert result.title == "Архив Буресвета. Книга 5. Ветер и Правда. Том 1"
        assert result.authors == "Брендон Сандерсон"
        assert result.tags == ""
        assert result.isbn == ""
        assert result.pubDate == "2024"
        assert result.coverUrl.startswith("https://www.litres.ru")

    def test_build_result_live_authors_count(self, search_instance, arts_detail):
        result = _build_result(search_instance, arts_detail)
        assert result is not None
        # Only 1 author (role=author), translator and 11 painters filtered out
        author_list = [a for a in result.authors.split(", ") if a]
        assert len(author_list) == 1
        assert author_list[0] == "Брендон Сандерсон"


# ── TestProcessItem ──

class TestProcessItem:
    def test_no_id_returns_none_without_calling_get_detailed(self):
        with patch("app.providers.litres._get_detailed") as mock_get:
            result = _process_item({"title": "Book without ID"})
        assert result is None
        mock_get.assert_not_called()

    def test_with_id_calls_get_detailed_and_uses_result(self):
        item = {"id": 42, "title": "Test Book"}
        with patch("app.providers.litres._get_detailed", return_value={"html_annotation": "X", "tags": []}) as mock_get:
            result = _process_item(item)
        mock_get.assert_called_once_with(42)
        assert result is not None
        assert result.description == "X"

    def test_get_detailed_returns_none_still_builds_result(self):
        item = {"id": 99, "title": "Some Book"}
        with patch("app.providers.litres._get_detailed", return_value=None):
            result = _process_item(item)
        assert result is not None
        assert result.title == "Some Book"
