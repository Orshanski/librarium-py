from pathlib import Path
from app.enrichers.pdf_render import render_cover

FIXTURES = Path(__file__).parent / "fixtures"


def test_render_cover_returns_jpeg_bytes():
    cover_bytes, ext = render_cover(str(FIXTURES / "tiny.pdf"))
    assert ext == "jpg"
    assert cover_bytes is not None
    assert len(cover_bytes) > 0
    # JPEG magic bytes
    assert cover_bytes[:3] == b"\xff\xd8\xff"


def test_render_cover_missing_file_returns_none():
    cover_bytes, ext = render_cover("/nonexistent/path.pdf")
    assert cover_bytes is None
    assert ext is None
