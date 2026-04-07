from fastapi import APIRouter, Request
from ..auth import get_current_user
from ..dal.filters import get_filter_options
from ..dal.books import get_all_publishers

router = APIRouter(tags=["options"])


@router.get("/api/options")
def get_options(request: Request):
    get_current_user(request)
    return {
        "authors": get_filter_options({}, "author"),
        "series": get_filter_options({}, "series"),
        "tags": get_filter_options({}, "tag"),
        "languages": get_filter_options({}, "language"),
        "publishers": get_all_publishers(),
    }
