from fastapi import APIRouter, Request
from ..auth import get_current_user
from ..dal.books import get_all_publishers

router = APIRouter(tags=["publishers"])


@router.get("/api/publishers")
def list_publishers(request: Request):
    get_current_user(request)
    return {"publishers": get_all_publishers()}
