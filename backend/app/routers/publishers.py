import sqlite3
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..services import publishers_service

router = APIRouter(tags=["publishers"])


class PublishersResponse(BaseModel):
    """Response for GET /api/publishers."""
    publishers: list[Any]


@router.get("/api/publishers", response_model=PublishersResponse)
def list_publishers(user: CurrentUser = Depends(get_current_user), db: sqlite3.Connection = Depends(db_session)):
    return PublishersResponse(publishers=publishers_service.list_publishers(db))
