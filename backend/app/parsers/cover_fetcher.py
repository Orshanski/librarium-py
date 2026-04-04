import logging
import httpx

log = logging.getLogger(__name__)

MAX_COVER_DOWNLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
TIMEOUT_SEC = 10.0

CONTENT_TYPE_TO_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def fetch_cover(url: str) -> tuple[bytes | None, str | None]:
    """Download image from URL. Returns (bytes, ext) or (None, None) on failure."""
    if not url or not url.startswith(("http://", "https://")):
        return None, None

    try:
        response = httpx.get(url, timeout=TIMEOUT_SEC, follow_redirects=True)
        response.raise_for_status()
    except Exception as e:
        log.warning("Cover fetch failed for %s: %s", url, e)
        return None, None

    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    ext = CONTENT_TYPE_TO_EXT.get(content_type)
    if not ext:
        log.warning("Non-image content-type for %s: %s", url, content_type)
        return None, None

    content = response.content
    if len(content) > MAX_COVER_DOWNLOAD_BYTES:
        log.warning("Cover too large (%d bytes) for %s", len(content), url)
        return None, None

    return content, ext
