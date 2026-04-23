import logging

import httpx

from ..ssrf import is_safe_url

log = logging.getLogger(__name__)

MAX_COVER_DOWNLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
TIMEOUT_SEC = 10.0
MAX_REDIRECTS = 5

CONTENT_TYPE_TO_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def _follow_redirect(response: httpx.Response, current_url: str) -> str | None:
    """Extract and resolve the redirect target URL from a response.

    Returns the absolute next URL, or None if Location header is missing.
    """
    location = response.headers.get("location", "")
    if not location:
        log.warning("Redirect without Location header: %s", current_url)
        return None
    return str(httpx.URL(current_url).join(location))


def _check_size_header(response: httpx.Response, url: str) -> bool:
    """Check Content-Length header against the download cap before streaming.

    Returns True if the size is acceptable (or header is absent/malformed).
    Returns False if Content-Length exceeds MAX_COVER_DOWNLOAD_BYTES.
    """
    size_hdr = response.headers.get("content-length")
    if not size_hdr:
        return True
    try:
        if int(size_hdr) > MAX_COVER_DOWNLOAD_BYTES:
            log.warning("Cover too large (Content-Length=%s) for %s", size_hdr, url)
            return False
    except ValueError:
        pass  # ignore malformed Content-Length
    return True


def _resolve_ext(response: httpx.Response, url: str) -> str | None:
    """Map Content-Type header to a file extension via CONTENT_TYPE_TO_EXT.

    Returns the extension string, or None if content-type is not supported.
    """
    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    ext = CONTENT_TYPE_TO_EXT.get(content_type)
    if not ext:
        log.warning("Non-image content-type for %s: %s", url, content_type)
    return ext


def _stream_with_cap(response: httpx.Response, url: str) -> bytes | None:
    """Stream response body, enforcing MAX_COVER_DOWNLOAD_BYTES cap.

    Returns accumulated bytes on success, or None if the cap is exceeded.
    """
    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_bytes():
        total += len(chunk)
        if total > MAX_COVER_DOWNLOAD_BYTES:
            log.warning("Cover too large (streamed %d bytes) for %s", total, url)
            return None
        chunks.append(chunk)
    return b"".join(chunks)


def fetch_cover(url: str) -> tuple[bytes | None, str | None]:
    """Download image from URL. Returns (bytes, ext) or (None, None) on failure.

    Redirects are followed manually with SSRF check on every hop, so a public
    URL that redirects to an internal IP gets rejected.
    """
    if not url or not url.startswith(("http://", "https://")):
        return None, None

    current_url = url
    for _ in range(MAX_REDIRECTS + 1):
        if not is_safe_url(current_url):
            return None, None

        try:
            with httpx.stream("GET", current_url, timeout=TIMEOUT_SEC, follow_redirects=False) as response:
                if response.is_redirect:
                    next_url = _follow_redirect(response, current_url)
                    if next_url is None:
                        return None, None
                    current_url = next_url
                    continue

                response.raise_for_status()

                if not _check_size_header(response, current_url):
                    return None, None

                ext = _resolve_ext(response, current_url)
                if ext is None:
                    return None, None

                body = _stream_with_cap(response, current_url)
                if body is None:
                    return None, None
                return body, ext
        except Exception as e:
            log.warning("Cover fetch failed for %s: %s", current_url, e)
            return None, None

    log.warning("Too many redirects starting from %s", url)
    return None, None
