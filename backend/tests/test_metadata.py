"""Tests for metadata search and cover-proxy endpoints (SSRF Layer 1)."""

from unittest.mock import patch, MagicMock

from tests._helpers import assert_error, assert_ok


class FakeResponse:
    def __init__(self, status_code=200, content=b"", headers=None, url=""):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}
        self.url = url or ""

    @property
    def is_redirect(self):
        return self.status_code in (301, 302, 303, 307, 308)


# ── /api/metadata/search ──


class TestMetadataSearch:
    def test_empty_query(self, reader_client):
        assert assert_ok(reader_client.get("/api/metadata/search", params={"q": ""})) == {"results": []}

    def test_whitespace_query(self, reader_client):
        assert assert_ok(reader_client.get("/api/metadata/search", params={"q": "   "})) == {"results": []}

    def test_auth_required(self, anon_client):
        assert_error(anon_client.get("/api/metadata/search", params={"q": "test"}), 401)

    @patch("app.routers.metadata.search_metadata")
    def test_provider_error_returns_empty(self, mock_search, reader_client):
        mock_search.side_effect = Exception("provider crashed")
        data = assert_ok(reader_client.get("/api/metadata/search", params={"q": "test book"}))
        assert data == {"results": []}

    @patch("app.routers.metadata.search_metadata")
    def test_happy_path(self, mock_search, reader_client):
        result = MagicMock()
        result.to_dict.return_value = {"title": "Test Book", "authors": "Author"}
        mock_search.return_value = [result]
        data = assert_ok(reader_client.get("/api/metadata/search", params={"q": "test"}))
        assert len(data["results"]) == 1
        assert data["results"][0]["title"] == "Test Book"


# ── /api/metadata/cover-proxy ──


class TestCoverProxy:
    def test_auth_required(self, anon_client):
        assert_error(anon_client.get("/api/metadata/cover-proxy",
                                     params={"url": "https://cv5.litres.ru/img.jpg"}), 401)

    def test_empty_url(self, reader_client):
        assert_error(reader_client.get("/api/metadata/cover-proxy"), 400)

    def test_ftp_scheme_rejected(self, reader_client):
        assert_error(reader_client.get("/api/metadata/cover-proxy",
                                       params={"url": "ftp://cv5.litres.ru/img.jpg"}), 400)

    def test_file_scheme_rejected(self, reader_client):
        assert_error(reader_client.get("/api/metadata/cover-proxy",
                                       params={"url": "file:///etc/passwd"}), 400)

    def test_non_whitelist_domain_rejected(self, reader_client):
        assert_error(reader_client.get("/api/metadata/cover-proxy",
                                       params={"url": "https://evil.com/img.jpg"}), 403)

    def test_localhost_rejected(self, reader_client):
        assert_error(reader_client.get("/api/metadata/cover-proxy",
                                       params={"url": "http://localhost:8080/secret"}), 403)

    def test_internal_ip_rejected(self, reader_client):
        assert_error(reader_client.get("/api/metadata/cover-proxy",
                                       params={"url": "http://169.254.169.254/metadata"}), 403)

    @patch("app.routers.metadata.is_safe_url", return_value=True)
    @patch("app.routers.metadata.requests.get")
    def test_redirect_to_non_whitelist_rejected(self, mock_get, mock_safe, reader_client):
        mock_get.return_value = FakeResponse(
            status_code=302,
            headers={"Location": "https://evil.com/redirected.jpg"},
            url="https://cv5.litres.ru/img.jpg",
        )
        assert_error(reader_client.get("/api/metadata/cover-proxy",
                                       params={"url": "https://cv5.litres.ru/img.jpg"}), 403)

    @patch("app.routers.metadata.is_safe_url", return_value=True)
    @patch("app.routers.metadata.requests.get")
    def test_non_image_content_type_rejected(self, mock_get, mock_safe, reader_client):
        mock_get.return_value = FakeResponse(
            status_code=200,
            content=b"<html>hack</html>",
            headers={"Content-Type": "text/html"},
            url="https://cv5.litres.ru/page.html",
        )
        assert_error(reader_client.get("/api/metadata/cover-proxy",
                                       params={"url": "https://cv5.litres.ru/page.html"}), 400)

    @patch("app.routers.metadata.is_safe_url", return_value=True)
    @patch("app.routers.metadata.requests.get")
    def test_network_error_returns_502(self, mock_get, mock_safe, reader_client):
        mock_get.side_effect = ConnectionError("timeout")
        assert_error(reader_client.get("/api/metadata/cover-proxy",
                                       params={"url": "https://cv5.litres.ru/img.jpg"}), 502)

    @patch("app.routers.metadata.is_safe_url", return_value=True)
    @patch("app.routers.metadata.requests.get")
    def test_upstream_error_forwarded(self, mock_get, mock_safe, reader_client):
        mock_get.return_value = FakeResponse(status_code=500, url="https://cv5.litres.ru/img.jpg")
        assert_error(reader_client.get("/api/metadata/cover-proxy",
                                       params={"url": "https://cv5.litres.ru/img.jpg"}), 500)

    @patch("app.routers.metadata.is_safe_url", return_value=True)
    @patch("app.routers.metadata.requests.get")
    def test_happy_path(self, mock_get, mock_safe, reader_client):
        jpeg_bytes = b"\xff\xd8\xff\xe0fake_jpeg_data"
        mock_get.return_value = FakeResponse(
            status_code=200,
            content=jpeg_bytes,
            headers={"Content-Type": "image/jpeg"},
            url="https://cv5.litres.ru/pub/c/cover/123.jpg",
        )
        resp = reader_client.get("/api/metadata/cover-proxy", params={"url": "https://cv5.litres.ru/pub/c/cover/123.jpg"})
        assert resp.status_code == 200
        assert resp.content == jpeg_bytes
        assert resp.headers["content-type"] == "image/jpeg"

    @patch("app.routers.metadata.is_safe_url", return_value=True)
    @patch("app.routers.metadata.requests.get")
    def test_happy_path_png(self, mock_get, mock_safe, reader_client):
        png_bytes = b"\x89PNG\r\n\x1a\nfake_png_data"
        mock_get.return_value = FakeResponse(
            status_code=200,
            content=png_bytes,
            headers={"Content-Type": "image/png"},
            url="https://books.google.com/cover.png",
        )
        resp = reader_client.get("/api/metadata/cover-proxy", params={"url": "https://books.google.com/cover.png"})
        assert resp.status_code == 200
        assert resp.content == png_bytes
