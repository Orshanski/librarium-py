import logging
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Request
from fastapi.responses import Response

from ..auth import get_current_user
from ..providers import search_metadata
from ..ssrf import is_safe_url

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/metadata", tags=["metadata"])

ALLOWED_COVER_DOMAINS = {"litres.ru", "www.litres.ru", "cv5.litres.ru", "cdn.litres.ru", "books.google.com", "encrypted-tbn0.gstatic.com", "books.googleusercontent.com"}
_MAX_REDIRECTS = 5
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; Librarium/1.0)"}


@router.get("/search")
def search(request: Request, q: str = "", providers: str = "litres"):
    get_current_user(request)
    if not q.strip():
        return {"results": []}
    provider_list = [p.strip() for p in providers.split(",") if p.strip()]
    try:
        results = search_metadata(q.strip(), provider_list)
    except Exception:
        log.exception("Metadata search failed")
        return {"results": []}
    return {"results": [r.to_dict() for r in results]}


def _is_allowed_domain(url: str) -> bool:
    return urlparse(url).hostname in ALLOWED_COVER_DOMAINS


@router.get("/cover-proxy")
def cover_proxy(request: Request, url: str = ""):
    get_current_user(request)
    if not url:
        return Response(status_code=400)

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return Response(status_code=400)
    if not _is_allowed_domain(url):
        return Response(status_code=403)

    try:
        current_url = url
        for _ in range(_MAX_REDIRECTS + 1):
            if not is_safe_url(current_url):
                return Response(status_code=403)
            if not _is_allowed_domain(current_url):
                return Response(status_code=403)

            resp = requests.get(current_url, timeout=15, headers=_HEADERS, allow_redirects=False)

            if resp.is_redirect:
                location = resp.headers.get("Location", "")
                if not location:
                    return Response(status_code=502)
                current_url = requests.compat.urljoin(current_url, location)
                continue

            if resp.status_code != 200:
                return Response(status_code=resp.status_code)
            content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
            if not content_type.startswith("image/"):
                return Response(status_code=400)
            return Response(content=resp.content, media_type=content_type)

        return Response(status_code=502)  # too many redirects
    except Exception:
        return Response(status_code=502)
