from pathlib import Path

from app.parsers import parse_book

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def test_parse_fb2():
    meta = parse_book(str(FIXTURES / "minimal.fb2"), "fb2")
    assert meta.title == "Minimal Test Book"
    assert "Test Author" in meta.authors
    assert meta.series == "Test Series"
    assert meta.series_number == 1.0
    assert meta.language == "Русский"
    assert meta.publisher == "Test Publisher"
    assert meta.isbn == "978-0-000-00001-0"
    assert "sf_fantasy" in meta.genres  # raw code; resolved in enrich_metadata


def test_parse_fb2_with_cover():
    meta = parse_book(str(FIXTURES / "with-cover.fb2"), "fb2")
    assert meta.title == "Book With Cover"
    assert "Cover Writer" in meta.authors
    assert meta.cover_data is not None
    assert meta.cover_ext is not None


def test_parse_epub():
    meta = parse_book(str(FIXTURES / "minimal.epub"), "epub")
    assert meta.title == "EPUB Test Book"
    assert "EPUB Author" in meta.authors
    assert meta.language == "English"


def test_parse_duplicate_same_metadata():
    meta = parse_book(str(FIXTURES / "duplicate.fb2"), "fb2")
    assert meta.title == "Minimal Test Book"
    assert "Test Author" in meta.authors


from lxml import etree
from app.parsers.epub import (
    NS,
    _extract_title,
    _extract_authors,
    _extract_language,
    _extract_description,
    _extract_genres,
    _extract_publisher,
    _extract_pub_date,
    _extract_series,
    _extract_isbn,
)


def _parse_metadata(inner_xml: str) -> etree._Element:
    """Обернуть XML-фрагмент метаданных в минимальный OPF и вернуть metadata-ноду."""
    opf_xml = (
        '<?xml version="1.0"?>'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0">'
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
        + inner_xml
        + '</metadata>'
        '</package>'
    )
    opf = etree.fromstring(opf_xml.encode("utf-8"))
    return opf.xpath("/pkg:package/pkg:metadata", namespaces=NS)[0]


def _parse_opf(inner_xml: str) -> etree._Element:
    """Обернуть XML-фрагмент (включая meta-теги на уровне metadata) в минимальный OPF и вернуть opf-ноду."""
    opf_xml = (
        '<?xml version="1.0"?>'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0">'
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
        + inner_xml
        + '</metadata>'
        '</package>'
    )
    return etree.fromstring(opf_xml.encode("utf-8"))


class TestEpubFieldExtractors:
    # _extract_title
    def test_title_present(self):
        p = _parse_metadata('<dc:title>Book Title</dc:title>')
        assert _extract_title(p) == "Book Title"

    def test_title_whitespace_stripped(self):
        p = _parse_metadata('<dc:title>  Padded  </dc:title>')
        assert _extract_title(p) == "Padded"

    def test_title_missing(self):
        p = _parse_metadata('')
        assert _extract_title(p) == ""

    # _extract_authors
    def test_authors_ampersand_split(self):
        p = _parse_metadata('<dc:creator>A &amp; B</dc:creator>')
        assert _extract_authors(p) == ["A", "B"]

    def test_authors_leading_trailing_ampersand_filtered(self):
        p = _parse_metadata('<dc:creator>&amp;A&amp;</dc:creator>')
        assert _extract_authors(p) == ["A"]

    def test_authors_multiple_creators(self):
        p = _parse_metadata('<dc:creator>A</dc:creator><dc:creator>B</dc:creator>')
        assert _extract_authors(p) == ["A", "B"]

    def test_authors_missing(self):
        p = _parse_metadata('')
        assert _extract_authors(p) == []

    # _extract_language
    def test_language_present(self):
        from app.parsers import normalize_language
        p = _parse_metadata('<dc:language>en</dc:language>')
        assert _extract_language(p) == normalize_language("en")

    def test_language_missing(self):
        p = _parse_metadata('')
        assert _extract_language(p) is None

    # _extract_description
    def test_description_stripped(self):
        p = _parse_metadata('<dc:description>  text  </dc:description>')
        assert _extract_description(p) == "text"

    def test_description_missing(self):
        p = _parse_metadata('')
        assert _extract_description(p) is None

    # _extract_genres
    def test_genres_present(self):
        p = _parse_metadata('<dc:subject>Sci-Fi</dc:subject><dc:subject>Fantasy</dc:subject>')
        assert _extract_genres(p) == ["Sci-Fi", "Fantasy"]

    def test_genres_empty_filtered(self):
        p = _parse_metadata('<dc:subject>Sci-Fi</dc:subject><dc:subject>   </dc:subject>')
        assert _extract_genres(p) == ["Sci-Fi"]

    def test_genres_missing(self):
        p = _parse_metadata('')
        assert _extract_genres(p) == []

    # _extract_publisher
    def test_publisher_present(self):
        p = _parse_metadata('<dc:publisher>EPUB Press</dc:publisher>')
        assert _extract_publisher(p) == "EPUB Press"

    def test_publisher_missing(self):
        p = _parse_metadata('')
        assert _extract_publisher(p) is None

    # _extract_pub_date
    def test_pub_date_iso_timestamp(self):
        p = _parse_metadata('<dc:date>2023-01-15T10:00:00Z</dc:date>')
        assert _extract_pub_date(p) == "2023-01-15"

    def test_pub_date_year_only(self):
        p = _parse_metadata('<dc:date>2025</dc:date>')
        assert _extract_pub_date(p) == "2025"

    def test_pub_date_unknown_returns_none(self):
        p = _parse_metadata('<dc:date>Unknown</dc:date>')
        assert _extract_pub_date(p) is None

    def test_pub_date_missing(self):
        p = _parse_metadata('')
        assert _extract_pub_date(p) is None

    # _extract_series
    def test_series_with_index(self):
        opf = _parse_opf(
            '<meta name="calibre:series" content="Foundation"/>'
            '<meta name="calibre:series_index" content="1.5"/>'
        )
        assert _extract_series(opf) == ("Foundation", 1.5)

    def test_series_without_index(self):
        opf = _parse_opf('<meta name="calibre:series" content="Foundation"/>')
        assert _extract_series(opf) == ("Foundation", None)

    def test_series_invalid_index(self):
        opf = _parse_opf(
            '<meta name="calibre:series" content="Foundation"/>'
            '<meta name="calibre:series_index" content="abc"/>'
        )
        assert _extract_series(opf) == ("Foundation", None)

    def test_series_missing(self):
        opf = _parse_opf('')
        assert _extract_series(opf) == (None, None)

    # _extract_isbn
    def test_isbn_lowercase_scheme(self):
        p = _parse_metadata(
            '<dc:identifier opf:scheme="isbn" xmlns:opf="http://www.idpf.org/2007/opf">978-0-000-00000-1</dc:identifier>'
        )
        assert _extract_isbn(p) == "978-0-000-00000-1"

    def test_isbn_uppercase_scheme(self):
        p = _parse_metadata(
            '<dc:identifier opf:scheme="ISBN" xmlns:opf="http://www.idpf.org/2007/opf">978-0-000-00000-2</dc:identifier>'
        )
        assert _extract_isbn(p) == "978-0-000-00000-2"

    def test_isbn_last_match_wins(self):
        p = _parse_metadata(
            '<dc:identifier opf:scheme="isbn" xmlns:opf="http://www.idpf.org/2007/opf">FIRST</dc:identifier>'
            '<dc:identifier opf:scheme="ISBN" xmlns:opf="http://www.idpf.org/2007/opf">LAST</dc:identifier>'
        )
        assert _extract_isbn(p) == "LAST"

    def test_isbn_no_scheme_attribute(self):
        p = _parse_metadata('<dc:identifier id="uid">not-an-isbn</dc:identifier>')
        assert _extract_isbn(p) is None

    def test_isbn_non_isbn_scheme(self):
        p = _parse_metadata(
            '<dc:identifier opf:scheme="DOI" xmlns:opf="http://www.idpf.org/2007/opf">10.1/123</dc:identifier>'
        )
        assert _extract_isbn(p) is None


import base64
import logging
from app.parsers.fb2 import (
    NS as FB2_NS,
    _extract_title as fb2_extract_title,
    _extract_authors as fb2_extract_authors,
    _extract_series as fb2_extract_series,
    _extract_genres as fb2_extract_genres,
    _extract_language as fb2_extract_language,
    _extract_annotation as fb2_extract_annotation,
    _extract_publisher as fb2_extract_publisher,
    _extract_pub_date as fb2_extract_pub_date,
    _extract_isbn as fb2_extract_isbn,
    _extract_cover as fb2_extract_cover,
)


def _build_fb2(title_info: str = "", publish_info: str = "", binaries: str = "") -> etree._Element:
    """Собрать минимальное FB2-дерево: title-info, publish-info, binaries — по месту."""
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">'
        '<description>'
        '<title-info>' + title_info + '</title-info>'
        '<publish-info>' + publish_info + '</publish-info>'
        '</description>'
        + binaries +
        '</FictionBook>'
    )
    return etree.fromstring(xml.encode("utf-8"))


class TestFb2FieldExtractors:

    # --- title ---

    def test_fb2_title_present(self):
        tree = _build_fb2(title_info="<book-title>Book</book-title>")
        assert fb2_extract_title(tree) == "Book"

    def test_fb2_title_missing(self):
        tree = _build_fb2()
        assert fb2_extract_title(tree) == ""

    # --- authors ---

    def test_fb2_author_full_name(self):
        tree = _build_fb2(title_info=(
            "<author>"
            "<first-name>First</first-name>"
            "<middle-name>Middle</middle-name>"
            "<last-name>Last</last-name>"
            "</author>"
        ))
        assert fb2_extract_authors(tree) == ["First Middle Last"]

    def test_fb2_author_first_last_only(self):
        tree = _build_fb2(title_info=(
            "<author>"
            "<first-name>First</first-name>"
            "<last-name>Last</last-name>"
            "</author>"
        ))
        assert fb2_extract_authors(tree) == ["First Last"]

    def test_fb2_author_nickname_only(self):
        tree = _build_fb2(title_info="<author><nickname>Nick</nickname></author>")
        assert fb2_extract_authors(tree) == ["Nick"]

    def test_fb2_author_empty_skipped(self):
        tree = _build_fb2(title_info="<author></author>")
        assert fb2_extract_authors(tree) == []

    def test_fb2_multiple_authors(self):
        tree = _build_fb2(title_info=(
            "<author><first-name>Alice</first-name></author>"
            "<author><first-name>Bob</first-name></author>"
        ))
        result = fb2_extract_authors(tree)
        assert len(result) == 2
        assert "Alice" in result
        assert "Bob" in result

    # --- series ---

    def test_fb2_series_title_info(self):
        tree = _build_fb2(title_info='<sequence name="Name" number="1.5"/>')
        assert fb2_extract_series(tree) == ("Name", 1.5)

    def test_fb2_series_publish_info_fallback(self):
        tree = _build_fb2(publish_info='<sequence name="PubSeries" number="2"/>')
        assert fb2_extract_series(tree) == ("PubSeries", 2.0)

    def test_fb2_series_empty_name(self):
        tree = _build_fb2(title_info='<sequence name="" number="1"/>')
        series, series_number = fb2_extract_series(tree)
        assert series is None
        assert series_number == 1.0

    def test_fb2_series_invalid_number(self):
        tree = _build_fb2(title_info='<sequence name="X" number="abc"/>')
        assert fb2_extract_series(tree) == ("X", None)

    # --- genres ---

    def test_fb2_genres_present(self):
        tree = _build_fb2(title_info="<genre>fantasy</genre><genre>  sf  </genre>")
        assert fb2_extract_genres(tree) == ["fantasy", "sf"]

    def test_fb2_genres_filters_empty(self):
        tree = _build_fb2(title_info="<genre></genre><genre>valid</genre>")
        assert fb2_extract_genres(tree) == ["valid"]

    # --- language ---

    def test_fb2_language_present(self):
        from app.parsers import normalize_language
        tree = _build_fb2(title_info="<lang>ru</lang>")
        assert fb2_extract_language(tree) == normalize_language("ru")

    def test_fb2_language_missing(self):
        tree = _build_fb2()
        assert fb2_extract_language(tree) is None

    # --- annotation ---

    def test_fb2_annotation_simple(self):
        tree = _build_fb2(title_info="<annotation><p>Hello world</p></annotation>")
        result = fb2_extract_annotation(tree)
        assert result is not None
        assert "Hello world" in result

    def test_fb2_annotation_nested_inline(self):
        tree = _build_fb2(title_info="<annotation><p>foo <em>bar</em> baz</p></annotation>")
        result = fb2_extract_annotation(tree)
        assert result is not None
        assert "foo" in result
        assert "bar" in result
        assert "baz" in result

    def test_fb2_annotation_missing(self):
        tree = _build_fb2()
        assert fb2_extract_annotation(tree) is None

    # --- publisher ---

    def test_fb2_publisher_present(self):
        tree = _build_fb2(publish_info="<publisher>Foo</publisher>")
        assert fb2_extract_publisher(tree) == "Foo"

    def test_fb2_publisher_missing(self):
        tree = _build_fb2()
        assert fb2_extract_publisher(tree) is None

    # --- pub_date ---

    def test_fb2_pub_date_from_date_value(self):
        tree = _build_fb2(title_info='<date value="2023-01-15"/>')
        assert fb2_extract_pub_date(tree) == "2023-01-15"

    def test_fb2_pub_date_year_fallback(self):
        tree = _build_fb2(publish_info="<year>2020</year>")
        assert fb2_extract_pub_date(tree) == "2020"

    def test_fb2_pub_date_missing_both(self):
        tree = _build_fb2()
        assert fb2_extract_pub_date(tree) is None

    # --- isbn ---

    def test_fb2_isbn_present(self):
        tree = _build_fb2(publish_info="<isbn>978-x</isbn>")
        assert fb2_extract_isbn(tree) == "978-x"

    def test_fb2_isbn_whitespace_stripped(self):
        tree = _build_fb2(publish_info="<isbn>  978-x  </isbn>")
        assert fb2_extract_isbn(tree) == "978-x"

    def test_fb2_isbn_empty_returns_none(self):
        tree = _build_fb2(publish_info="<isbn>   </isbn>")
        assert fb2_extract_isbn(tree) is None

    # --- cover ---

    def test_fb2_cover_ns_binary(self):
        img_bytes = b"\xff\xd8\xff\xe0JFIF"
        b64 = base64.b64encode(img_bytes).decode("ascii")
        tree = _build_fb2(
            title_info='<coverpage><image l:href="#c1"/></coverpage>',
            binaries='<binary xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" id="c1" content-type="image/jpeg">' + b64 + '</binary>',
        )
        data, ext = fb2_extract_cover(tree)
        assert data == img_bytes
        assert ext == "jpg"

    def test_fb2_cover_no_ns_binary_fallback(self):
        img_bytes = b"\xff\xd8\xff\xe0JFIF"
        b64 = base64.b64encode(img_bytes).decode("ascii")
        # binary без FB2-namespace — попадёт в no-ns fallback ветку
        tree = _build_fb2(
            title_info='<coverpage><image l:href="#c2"/></coverpage>',
            binaries='<binary xmlns="" id="c2" content-type="image/jpeg">' + b64 + '</binary>',
        )
        data, ext = fb2_extract_cover(tree)
        assert data == img_bytes
        assert ext == "jpg"

    def test_fb2_cover_png(self):
        img_bytes = b"\x89PNG\r\n"
        b64 = base64.b64encode(img_bytes).decode("ascii")
        tree = _build_fb2(
            title_info='<coverpage><image l:href="#cpng"/></coverpage>',
            binaries='<binary xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" id="cpng" content-type="image/png">' + b64 + '</binary>',
        )
        data, ext = fb2_extract_cover(tree)
        assert data == img_bytes
        assert ext == "png"

    def test_fb2_cover_unknown_content_type(self):
        img_bytes = b"TIFF_DATA"
        b64 = base64.b64encode(img_bytes).decode("ascii")
        tree = _build_fb2(
            title_info='<coverpage><image l:href="#ctiff"/></coverpage>',
            binaries='<binary xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" id="ctiff" content-type="image/tiff">' + b64 + '</binary>',
        )
        data, ext = fb2_extract_cover(tree)
        assert data == img_bytes
        assert ext == "jpg"

    def test_fb2_cover_missing_coverpage(self):
        tree = _build_fb2()
        assert fb2_extract_cover(tree) == (None, None)

    def test_fb2_cover_invalid_base64(self, caplog):
        with caplog.at_level(logging.WARNING, logger="app.parsers.fb2"):
            tree = _build_fb2(
                title_info='<coverpage><image l:href="#cbad"/></coverpage>',
                binaries='<binary xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" id="cbad" content-type="image/jpeg">!!!NOT_VALID_BASE64!!!</binary>',
            )
            data, ext = fb2_extract_cover(tree)
        assert data is None
        assert ext is None
        assert any("Cannot extract FB2 cover" in r.message for r in caplog.records)
