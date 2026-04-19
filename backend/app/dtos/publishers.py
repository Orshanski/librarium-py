"""Publishers Response DTOs."""
from pydantic import BaseModel


class PublishersResponse(BaseModel):
    """Response for GET /api/publishers."""
    publishers: list[str]
