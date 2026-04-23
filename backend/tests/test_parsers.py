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
