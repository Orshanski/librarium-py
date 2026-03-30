from urllib.parse import urlparse
import requests
from fastapi import APIRouter, Request
from fastapi.responses import Response
from ..auth import get_current_user
from ..providers import search_metadata

router = APIRouter(prefix="/api/metadata", tags=["metadata"])

ALLOWED_COVER_DOMAINS = {"litres.ru", "www.litres.ru", "cv5.litres.ru", "books.google.com", "encrypted-tbn0.gstatic.com", "books.googleusercontent.com"}


@router.get("/search")
def search(request: Request, q: str = "", providers: str = "litres"):
    get_current_user(request)
    if not q.strip():
        return {"results": []}
    provider_list = [p.strip() for p in providers.split(",") if p.strip()]
    results = search_metadata(q.strip(), provider_list)
    return {"results": [r.to_dict() for r in results]}


@router.get("/cover-proxy")
def cover_proxy(request: Request, url: str = ""):
    get_current_user(request)
    if not url:
        return Response(status_code=400)

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return Response(status_code=400)
    if parsed.hostname not in ALLOWED_COVER_DOMAINS:
        return Response(status_code=403)

    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Librarium/1.0"})
        if resp.status_code != 200:
            return Response(status_code=resp.status_code)
        content_type = resp.headers.get("Content-Type", "image/jpeg")
        if not content_type.startswith("image/"):
            return Response(status_code=400)
        return Response(content=resp.content, media_type=content_type)
    except Exception:
        return Response(status_code=502)
