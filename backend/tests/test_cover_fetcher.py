import logging
from unittest.mock import MagicMock, patch
from app.enrichers.cover_fetcher import fetch_cover


def _mock_stream_response(status_code=200, content_type="image/jpeg", content=b"\xff\xd8\xff\xe0fake", content_length=None, is_redirect=False, location=""):
    """Build a mock context manager returning a response-like object for httpx.stream."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.is_redirect = is_redirect
    headers = {}
    if is_redirect:
        headers["location"] = location
    else:
        headers["content-type"] = content_type
        if content_length is None:
            headers["content-length"] = str(len(content))
        elif content_length != "":
            headers["content-length"] = str(content_length)
    resp.headers = headers
    resp.iter_bytes = MagicMock(return_value=iter([content]))
    resp.raise_for_status = MagicMock()

    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=resp)
    cm.__exit__ = MagicMock(return_value=False)
    return cm


def test_fetch_cover_jpeg_success():
    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = _mock_stream_response()
        data, ext = fetch_cover("https://cdn.ast.ru/cover.jpg")
    assert data is not None
    assert ext == "jpg"
    assert data.startswith(b"\xff\xd8\xff")


def test_fetch_cover_png_success():
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"fake"
    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = _mock_stream_response(content_type="image/png", content=png_bytes)
        data, ext = fetch_cover("https://example.com/cover.png")
    assert data == png_bytes
    assert ext == "png"


def test_fetch_cover_empty_url_returns_none():
    data, ext = fetch_cover("")
    assert data is None
    assert ext is None


def test_fetch_cover_non_http_scheme_returns_none():
    # javascript:, ftp://, file:// etc. — all rejected
    for url in ("javascript:alert(1)", "ftp://example.com/f.jpg", "file:///etc/passwd"):
        data, ext = fetch_cover(url)
        assert data is None
        assert ext is None


def test_fetch_cover_non_image_content_type_returns_none():
    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = _mock_stream_response(content_type="text/html")
        data, ext = fetch_cover("https://example.com/page.html")
    assert data is None
    assert ext is None


def test_fetch_cover_rejected_by_content_length_header():
    # Content-Length says huge; reject before streaming body
    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = _mock_stream_response(content_length=50 * 1024 * 1024)
        data, ext = fetch_cover("https://example.com/huge.jpg")
    assert data is None
    assert ext is None


def test_fetch_cover_rejected_by_streamed_size():
    # No Content-Length, but streamed content exceeds limit
    huge_chunk = b"\xff\xd8\xff" + b"x" * (10 * 1024 * 1024 + 1)
    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = _mock_stream_response(content=huge_chunk, content_length="")
        data, ext = fetch_cover("https://example.com/huge.jpg")
    assert data is None
    assert ext is None


def test_fetch_cover_http_error_returns_none():
    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.side_effect = Exception("connection refused")
        data, ext = fetch_cover("https://example.com/cover.jpg")
    assert data is None
    assert ext is None


def test_is_safe_url_rejects_localhost():
    from app.ssrf import is_safe_url
    assert is_safe_url("http://localhost/cover.jpg") is False
    assert is_safe_url("http://127.0.0.1/cover.jpg") is False


def test_is_safe_url_rejects_link_local():
    from app.ssrf import is_safe_url
    # AWS/Hetzner cloud metadata endpoint
    assert is_safe_url("http://169.254.169.254/metadata") is False


def test_fetch_cover_follows_safe_redirect():
    # Public redirect to another public URL — should work
    responses = [
        _mock_stream_response(is_redirect=True, location="https://cdn.example.com/cover.jpg"),
        _mock_stream_response(content_type="image/jpeg"),
    ]
    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.side_effect = responses
        data, ext = fetch_cover("https://example.com/r")
    assert data is not None
    assert ext == "jpg"


def test_fetch_cover_rejects_redirect_to_internal_ip():
    # Public URL redirects to link-local IP — must be rejected on 2nd hop
    # _is_safe_url returns True for the initial URL, False for the redirect target
    safe_url_results = iter([True, False])
    with patch("app.enrichers.cover_fetcher.is_safe_url", side_effect=lambda u: next(safe_url_results)), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = _mock_stream_response(is_redirect=True, location="http://169.254.169.254/metadata")
        data, ext = fetch_cover("https://example.com/r")
    assert data is None
    assert ext is None


def test_fetch_cover_redirect_chain_limit():
    # Infinite redirect loop — bounded by MAX_REDIRECTS
    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = _mock_stream_response(is_redirect=True, location="https://example.com/loop")
        data, ext = fetch_cover("https://example.com/loop")
    assert data is None
    assert ext is None


def test_is_safe_url_rejects_private_ranges():
    from app.ssrf import is_safe_url
    assert is_safe_url("http://10.0.0.1/cover.jpg") is False
    assert is_safe_url("http://192.168.1.1/cover.jpg") is False
    assert is_safe_url("http://172.16.0.1/cover.jpg") is False


# ---------------------------------------------------------------------------
# E2.1 — redirect без Location → (None, None)
# ---------------------------------------------------------------------------

def test_fetch_cover_redirect_without_location_returns_none():
    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = _mock_stream_response(is_redirect=True, location="")
        data, ext = fetch_cover("https://example.com/r")
    assert data is None
    assert ext is None


# ---------------------------------------------------------------------------
# E2.2 — malformed Content-Length → fall through to streaming path
# ---------------------------------------------------------------------------

def test_fetch_cover_malformed_content_length_falls_through():
    body = b"\xff\xd8\xff\xe0fake"
    resp = MagicMock()
    resp.is_redirect = False
    resp.headers = {
        "content-type": "image/jpeg",
        "content-length": "abc",  # invalid
    }
    resp.iter_bytes = MagicMock(return_value=iter([body]))
    resp.raise_for_status = MagicMock()
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=resp)
    cm.__exit__ = MagicMock(return_value=False)

    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = cm
        data, ext = fetch_cover("https://example.com/cover.jpg")
    assert data == body
    assert ext == "jpg"


# ---------------------------------------------------------------------------
# E2.3 — Content-Type с charset → success
# ---------------------------------------------------------------------------

def test_fetch_cover_content_type_with_charset_success():
    body = b"\xff\xd8\xff\xe0fake"
    resp = MagicMock()
    resp.is_redirect = False
    resp.headers = {
        "content-type": "image/jpeg; charset=utf-8",
        "content-length": str(len(body)),
    }
    resp.iter_bytes = MagicMock(return_value=iter([body]))
    resp.raise_for_status = MagicMock()
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=resp)
    cm.__exit__ = MagicMock(return_value=False)

    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = cm
        data, ext = fetch_cover("https://example.com/cover.jpg")
    assert data == body
    assert ext == "jpg"


# ---------------------------------------------------------------------------
# E2.4 — relative redirect → resolve through httpx.URL.join
# ---------------------------------------------------------------------------

def test_fetch_cover_relative_redirect_resolves():
    body = b"\xff\xd8\xff\xe0fake"
    responses = [
        _mock_stream_response(is_redirect=True, location="/cover.jpg"),
        _mock_stream_response(content_type="image/jpeg", content=body),
    ]
    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.side_effect = responses
        data, ext = fetch_cover("https://example.com/books/1")
    assert data == body
    assert ext == "jpg"
    # Second call must have been made with the absolute resolved URL
    second_call_url = mock_stream.call_args_list[1][0][1]
    assert second_call_url == "https://example.com/cover.jpg"


# ---------------------------------------------------------------------------
# E2.5 — cyclic redirect A→B→A → too-many-redirects
# ---------------------------------------------------------------------------

def test_fetch_cover_alternating_redirect_cycle_hits_limit():
    url_a = "https://example.com/a"
    url_b = "https://example.com/b"

    def _side_effect(_method, url, **_kwargs):
        if url == url_a:
            return _mock_stream_response(is_redirect=True, location=url_b)
        return _mock_stream_response(is_redirect=True, location=url_a)

    with patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream", side_effect=_side_effect):
        data, ext = fetch_cover(url_a)
    assert data is None
    assert ext is None


# ---------------------------------------------------------------------------
# E2.6 — SSRF on 3rd hop → reject
# ---------------------------------------------------------------------------

def test_fetch_cover_ssrf_on_third_hop_rejects():
    responses = [
        _mock_stream_response(is_redirect=True, location="https://public.com/2"),
        _mock_stream_response(is_redirect=True, location="http://127.0.0.1/3"),
    ]
    # is_safe_url: True for public.com/1, True for public.com/2, False for 127.0.0.1
    safe_results = iter([True, True, False])
    with patch("app.enrichers.cover_fetcher.is_safe_url", side_effect=lambda u: next(safe_results)), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.side_effect = responses
        data, ext = fetch_cover("https://public.com/1")
    assert data is None
    assert ext is None


# ---------------------------------------------------------------------------
# E2.7 — Content-Type absent → None with "Missing"-warning
# ---------------------------------------------------------------------------

def test_fetch_cover_missing_content_type_returns_none(caplog):
    resp = MagicMock()
    resp.is_redirect = False
    resp.headers = {}  # no content-type at all
    resp.iter_bytes = MagicMock(return_value=iter([b""]))
    resp.raise_for_status = MagicMock()
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=resp)
    cm.__exit__ = MagicMock(return_value=False)

    with caplog.at_level(logging.WARNING, logger="app.enrichers.cover_fetcher"), \
         patch("app.enrichers.cover_fetcher.is_safe_url", return_value=True), \
         patch("app.enrichers.cover_fetcher.httpx.stream") as mock_stream:
        mock_stream.return_value = cm
        data, ext = fetch_cover("https://example.com/cover.jpg")
    assert data is None
    assert ext is None
    assert any("Missing content-type" in r.message for r in caplog.records)
