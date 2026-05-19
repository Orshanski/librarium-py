from typing import Annotated
import sqlite3
from fastapi import APIRouter, Depends
from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.search import SearchResponse
from ..services import search_service

router = APIRouter(tags=["search"])


@router.get("/api/search", response_model=SearchResponse)
def search(user: Annotated[CurrentUser, Depends(get_current_user)], db: Annotated[sqlite3.Connection, Depends(db_session)], q: str = "", limit: int = 50):
    return search_service.search(db, q, limit, user_id=user.user_id)
