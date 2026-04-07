import logging
import httpx

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


def fetch_cover(url: str) -> tuple[bytes | None, str | None]:
    """Download image from URL. Returns (bytes, ext) or (None, None) on failure.

    Redirects are followed manually with SSRF check on every hop, so a public
    URL that redirects to an internal IP gets rejected.
    """
    if not url or not url.startswith(("http://", "https://")):
        return None, None

    # Follow redirects manually — SSRF check on every hop, including final target
    current_url = url
    for _ in range(MAX_REDIRECTS + 1):
        if not _is_safe_url(current_url):
            return None, None

        try:
            with httpx.stream("GET", current_url, timeout=TIMEOUT_SEC, follow_redirects=False) as response:
                # Handle redirect: validate new location then loop
                if response.is_redirect:
                    location = response.headers.get("location", "")
                    if not location:
                        log.warning("Redirect without Location header: %s", current_url)
                        return None, None
                    current_url = str(httpx.URL(current_url).join(location))
                    continue

                response.raise_for_status()

                # Check Content-Length header before consuming body
                size_hdr = response.headers.get("content-length")
                if size_hdr:
                    try:
                        if int(size_hdr) > MAX_COVER_DOWNLOAD_BYTES:
                            log.warning("Cover too large (Content-Length=%s) for %s", size_hdr, current_url)
                            return None, None
                    except ValueError:
                        pass  # ignore malformed Content-Length

                content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
                ext = CONTENT_TYPE_TO_EXT.get(content_type)
                if not ext:
                    log.warning("Non-image content-type for %s: %s", current_url, content_type)
                    return None, None

                # Stream body with running size cap
                chunks: list[bytes] = []
                total = 0
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > MAX_COVER_DOWNLOAD_BYTES:
                        log.warning("Cover too large (streamed %d bytes) for %s", total, current_url)
                        return None, None
                    chunks.append(chunk)
                return b"".join(chunks), ext
        except Exception as e:
            log.warning("Cover fetch failed for %s: %s", current_url, e)
            return None, None

    log.warning("Too many redirects starting from %s", url)
    return None, None


def _is_safe_url(url: str) -> bool:
    """Reject URLs resolving to private/loopback/link-local IPs (SSRF protection).

    Must be called on every redirect hop — a public URL can 302 to an internal IP.
    """
    import ipaddress
    import socket
    if not url.startswith(("http://", "https://")):
        log.warning("Rejected non-http(s) URL: %s", url)
        return False
    try:
        host = httpx.URL(url).host
        if not host:
            return False
        addr_info = socket.getaddrinfo(host, None)
    except Exception as e:
        log.warning("URL host resolution failed for %s: %s", url, e)
        return False

    for family, _, _, _, sockaddr in addr_info:
        try:
            ip = ipaddress.ip_address(sockaddr[0])
        except (ValueError, IndexError):
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            log.warning("Rejected URL with unsafe IP %s: %s", ip, url)
            return False
    return True
