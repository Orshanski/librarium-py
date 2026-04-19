"""Cover request/response DTOs."""
from pydantic import BaseModel


class CoverUploadResponse(BaseModel):
    """Response for POST /api/books/{book_id}/cover."""
    ok: bool = True
    tempCoverUrl: str
