import logging
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Depends, HTTPException
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
def search(user: dict = Depends(get_current_user), q: str = "", providers: str = "litres"):
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
def cover_proxy(user: dict = Depends(get_current_user), url: str = ""):
    if not url:
        raise HTTPException(status_code=400, detail="URL required")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="URL scheme not allowed")
    if not _is_allowed_domain(url):
        raise HTTPException(status_code=403, detail="Domain not in allow-list")

    try:
        current_url = url
        for _ in range(_MAX_REDIRECTS + 1):
            if not is_safe_url(current_url):
                raise HTTPException(status_code=403, detail="URL points to a non-public address")
            if not _is_allowed_domain(current_url):
                raise HTTPException(status_code=403, detail="Domain not in allow-list")

            resp = requests.get(current_url, timeout=15, headers=_HEADERS, allow_redirects=False)

            if resp.is_redirect:
                location = resp.headers.get("Location", "")
                if not location:
                    raise HTTPException(status_code=502, detail="Upstream fetch failed")
                current_url = requests.compat.urljoin(current_url, location)
                continue

            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Upstream error")
            content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
            if not content_type.startswith("image/"):
                raise HTTPException(status_code=400, detail="Response is not an image")
            return Response(content=resp.content, media_type=content_type)

        raise HTTPException(status_code=502, detail="Too many redirects")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Upstream fetch failed")
