"""DTO package — common response models shared across domains."""
from pydantic import BaseModel


class OkResponse(BaseModel):
    """Common {"ok": True} response for mutation endpoints (update, delete, etc.)."""
    ok: bool = True


class IdResponse(BaseModel):
    """Common {"id": int} response for creation endpoints."""
    id: int
