import sqlite3

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.publishers import PublishersResponse
from ..services import publishers_service

router = APIRouter(tags=["publishers"])


@router.get("/api/publishers", response_model=PublishersResponse)
def list_publishers(user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    return publishers_service.list_publishers(db)
