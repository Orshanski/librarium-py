"""DTO package — common response models shared across domains."""
from pydantic import BaseModel


class OkResponse(BaseModel):
    """Common {"ok": True} response for mutation endpoints (update, delete, etc.)."""
    ok: bool = True


class IdResponse(BaseModel):
    """Common {"id": int} response for creation endpoints."""
    id: int


from ._aliases import to_camel  # noqa: F401
from ._refs import AuthorRef, TagRef, SeriesRef  # noqa: F401
