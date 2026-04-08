"""SSRF protection utilities.

Provides IP-level validation for outbound HTTP requests. Must be called
on every redirect hop — a public URL can 302 to an internal IP.
"""
import ipaddress
import logging
import socket
from urllib.parse import urlparse

log = logging.getLogger(__name__)


def is_safe_url(url: str) -> bool:
    """Reject URLs resolving to private/loopback/link-local IPs."""
    if not url.startswith(("http://", "https://")):
        log.warning("Rejected non-http(s) URL: %s", url)
        return False
    try:
        host = urlparse(url).hostname
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
