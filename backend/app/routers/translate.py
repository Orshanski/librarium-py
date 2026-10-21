from typing import Annotated
import sqlite3
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from ..auth import CurrentUser, get_current_user
from ..database import db_session
from ..dtos.translate import TranslateChatBody
from ..services import translate_service

router = APIRouter(tags=["translate"])


@router.post("/api/translate/chat")
def translate_chat(
    body: TranslateChatBody,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[sqlite3.Connection, Depends(db_session)],
):
    system, messages = translate_service.prepare_chat(db, user.user_id, body)
    return StreamingResponse(
        translate_service.chat_events(system, messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
