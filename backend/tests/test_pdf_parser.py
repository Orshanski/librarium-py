from pathlib import Path
from unittest.mock import patch
from app.enrichers.pdf import enrich_pdf
from app.parsers import ParsedMetadata
from app.enrichers.pdf_llm import LlmMetadata

FIXTURES = Path(__file__).parent / "fixtures"


def test_enrich_pdf_uses_llm_metadata():
    llm_meta = LlmMetadata(
        title="Real Title", authors=["Real Author"], publisher="Real Pub",
        year="2020", isbn="978-0-000-00000-0", annotation="Great book",
        genres=["Fiction", "Thriller"], cover_url=""
    )
    with patch("app.enrichers.pdf.extract_metadata_from_filename", return_value=llm_meta), \
         patch("app.enrichers.pdf.fetch_cover", return_value=(None, None)), \
         patch("app.enrichers.pdf.render_cover", return_value=(b"\xff\xd8\xffFAKE", "jpg")):
        meta = enrich_pdf(ParsedMetadata(), "book.pdf", str(FIXTURES / "tiny.pdf"))
    assert meta.title == "Real Title"
    assert meta.authors == ["Real Author"]
    assert meta.publisher == "Real Pub"
    assert meta.pub_date == "2020"
    assert meta.isbn == "9780000000000"  # hyphens stripped
    assert meta.description == "Great book"
    assert meta.genres == ["Fiction", "Thriller"]
    assert meta.cover_data == b"\xff\xd8\xffFAKE"
    assert meta.cover_ext == "jpg"


def test_enrich_pdf_normalizes_year_from_prose():
    llm_meta = LlmMetadata(title="X", year="приблизительно 1985 год")
    with patch("app.enrichers.pdf.extract_metadata_from_filename", return_value=llm_meta), \
         patch("app.enrichers.pdf.fetch_cover", return_value=(None, None)), \
         patch("app.enrichers.pdf.render_cover", return_value=(None, None)):
        meta = enrich_pdf(ParsedMetadata(), "book.pdf", str(FIXTURES / "tiny.pdf"))
    assert meta.pub_date == "1985"


def test_enrich_pdf_rejects_invalid_year():
    llm_meta = LlmMetadata(title="X", year="н/д")
    with patch("app.enrichers.pdf.extract_metadata_from_filename", return_value=llm_meta), \
         patch("app.enrichers.pdf.fetch_cover", return_value=(None, None)), \
         patch("app.enrichers.pdf.render_cover", return_value=(None, None)):
        meta = enrich_pdf(ParsedMetadata(), "book.pdf", str(FIXTURES / "tiny.pdf"))
    assert meta.pub_date is None


def test_enrich_pdf_rejects_short_isbn():
    llm_meta = LlmMetadata(title="X", isbn="12345")
    with patch("app.enrichers.pdf.extract_metadata_from_filename", return_value=llm_meta), \
         patch("app.enrichers.pdf.fetch_cover", return_value=(None, None)), \
         patch("app.enrichers.pdf.render_cover", return_value=(None, None)):
        meta = enrich_pdf(ParsedMetadata(), "book.pdf", str(FIXTURES / "tiny.pdf"))
    assert meta.isbn is None


def test_enrich_pdf_accepts_isbn10():
    llm_meta = LlmMetadata(title="X", isbn="0-306-40615-2")
    with patch("app.enrichers.pdf.extract_metadata_from_filename", return_value=llm_meta), \
         patch("app.enrichers.pdf.fetch_cover", return_value=(None, None)), \
         patch("app.enrichers.pdf.render_cover", return_value=(None, None)):
        meta = enrich_pdf(ParsedMetadata(), "book.pdf", str(FIXTURES / "tiny.pdf"))
    assert meta.isbn == "0306406152"


def test_enrich_pdf_uses_cover_url_when_available():
    llm_meta = LlmMetadata(title="X", authors=["Y"], cover_url="https://example.com/c.jpg")
    with patch("app.enrichers.pdf.extract_metadata_from_filename", return_value=llm_meta), \
         patch("app.enrichers.pdf.fetch_cover", return_value=(b"JPEG_FROM_URL", "jpg")) as mock_fetch, \
         patch("app.enrichers.pdf.render_cover") as mock_render:
        meta = enrich_pdf(ParsedMetadata(), "book.pdf", str(FIXTURES / "tiny.pdf"))
    mock_fetch.assert_called_once_with("https://example.com/c.jpg")
    mock_render.assert_not_called()
    assert meta.cover_data == b"JPEG_FROM_URL"


def test_enrich_pdf_fallback_render_when_fetch_fails():
    llm_meta = LlmMetadata(title="X", cover_url="https://broken.com/c.jpg")
    with patch("app.enrichers.pdf.extract_metadata_from_filename", return_value=llm_meta), \
         patch("app.enrichers.pdf.fetch_cover", return_value=(None, None)), \
         patch("app.enrichers.pdf.render_cover", return_value=(b"RENDERED", "jpg")):
        meta = enrich_pdf(ParsedMetadata(), "book.pdf", str(FIXTURES / "tiny.pdf"))
    assert meta.cover_data == b"RENDERED"


def test_enrich_pdf_fallback_filename_when_llm_empty():
    with patch("app.enrichers.pdf.extract_metadata_from_filename", return_value=LlmMetadata()), \
         patch("app.enrichers.pdf.fetch_cover", return_value=(None, None)), \
         patch("app.enrichers.pdf.render_cover", return_value=(None, None)):
        meta = enrich_pdf(ParsedMetadata(), "Some_Book_Name.pdf", str(FIXTURES / "tiny.pdf"))
    assert meta.title == "Some_Book_Name"
    assert meta.authors == []


def test_enrich_pdf_passes_multiple_authors():
    llm_meta = LlmMetadata(title="X", authors=["John Doe", "Jane Smith"])
    with patch("app.enrichers.pdf.extract_metadata_from_filename", return_value=llm_meta), \
         patch("app.enrichers.pdf.fetch_cover", return_value=(None, None)), \
         patch("app.enrichers.pdf.render_cover", return_value=(None, None)):
        meta = enrich_pdf(ParsedMetadata(), "book.pdf", str(FIXTURES / "tiny.pdf"))
    assert meta.authors == ["John Doe", "Jane Smith"]
