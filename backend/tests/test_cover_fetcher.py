from unittest.mock import MagicMock, patch
from app.parsers.cover_fetcher import fetch_cover


def _mock_response(status_code=200, content_type="image/jpeg", content=b"\xff\xd8\xff\xe0fake"):
    resp = MagicMock()
    resp.status_code = status_code
    resp.headers = {"content-type": content_type, "content-length": str(len(content))}
    resp.content = content
    resp.raise_for_status = MagicMock()
    return resp


def test_fetch_cover_jpeg_success():
    with patch("app.parsers.cover_fetcher.httpx.get") as mock_get:
        mock_get.return_value = _mock_response()
        data, ext = fetch_cover("https://cdn.ast.ru/cover.jpg")
    assert data is not None
    assert ext == "jpg"
    assert data.startswith(b"\xff\xd8\xff")


def test_fetch_cover_png_success():
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"fake"
    with patch("app.parsers.cover_fetcher.httpx.get") as mock_get:
        mock_get.return_value = _mock_response(content_type="image/png", content=png_bytes)
        data, ext = fetch_cover("https://example.com/cover.png")
    assert data == png_bytes
    assert ext == "png"


def test_fetch_cover_empty_url_returns_none():
    data, ext = fetch_cover("")
    assert data is None
    assert ext is None


def test_fetch_cover_non_image_content_type_returns_none():
    with patch("app.parsers.cover_fetcher.httpx.get") as mock_get:
        mock_get.return_value = _mock_response(content_type="text/html")
        data, ext = fetch_cover("https://example.com/page.html")
    assert data is None
    assert ext is None


def test_fetch_cover_too_large_returns_none():
    huge = b"\xff\xd8\xff" + b"x" * (10 * 1024 * 1024 + 1)
    with patch("app.parsers.cover_fetcher.httpx.get") as mock_get:
        mock_get.return_value = _mock_response(content=huge)
        data, ext = fetch_cover("https://example.com/huge.jpg")
    assert data is None
    assert ext is None


def test_fetch_cover_http_error_returns_none():
    with patch("app.parsers.cover_fetcher.httpx.get") as mock_get:
        mock_get.side_effect = Exception("connection refused")
        data, ext = fetch_cover("https://example.com/cover.jpg")
    assert data is None
    assert ext is None
