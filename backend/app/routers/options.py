from fastapi import APIRouter, Request
from ..auth import get_current_user
from ..dal.authors import get_all_authors
from ..dal.series import get_all_series
from ..dal.tags import get_all_tags
from ..dal.books import get_all_languages, get_all_publishers

router = APIRouter(tags=["options"])


@router.get("/api/options")
def get_options(request: Request):
    get_current_user(request)
    return {
        "authors": get_all_authors(),
        "series": get_all_series(),
        "tags": get_all_tags(),
        "languages": get_all_languages(),
        "publishers": get_all_publishers(),
    }
