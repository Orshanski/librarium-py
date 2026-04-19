"""Reader request DTOs and Response DTOs."""
from typing import Any, NotRequired, TypedDict

from pydantic import BaseModel, Field


class ReaderSettingsBody(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)


class ReadingProgressBody(BaseModel):
    position: str
    last_device: str = ""
    last_format: str = ""
    fraction: float = Field(0, ge=0, le=1)
    expected_version: int = Field(0, ge=0)


# ---------------------------------------------------------------------------
# Read-path TypedDicts — one per distinct SELECT shape (R-A).
# ---------------------------------------------------------------------------


class ReadingProgressRow(TypedDict):
    """Row from dal.reader.get_reading_progress.
    Columns: position, last_device, last_format, fraction, last_read_at, version.
    All non-version fields can be None when returned from the default (no-row)
    branch — position/last_device/last_format/fraction/last_read_at are None,
    version is 0."""
    position: str | None
    last_device: str | None
    last_format: str | None
    fraction: float | None
    last_read_at: str | None
    version: int


class ProgressSaveResult(TypedDict):
    """CAS result from dal.reader.save_reading_progress.

    accepted=True  branch: {"accepted": True, "version": int, "rebased": bool}
    accepted=False branch: {"accepted": False, "current": ReadingProgressRow | None}
    retry_exhausted branch: {"accepted": False, "retry_exhausted": True, "current": None}

    Fields version, rebased, retry_exhausted are NotRequired because they
    are absent on non-matching branches.  current is NotRequired because it
    is absent on the accepted=True branch."""
    accepted: bool
    version: NotRequired[int]
    rebased: NotRequired[bool]
    retry_exhausted: NotRequired[bool]
    current: NotRequired[ReadingProgressRow | None]


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only. R-B: never
# imported from DAL; construction in service layer.
# ---------------------------------------------------------------------------


class ReadingProgressResponse(BaseModel):
    """Response for GET /api/reader/progress/{book_id}.

    Wire format: {position, last_device, last_format, fraction, last_read_at, version}
    All fields except version can be None (no-row branch returns zeroed row).
    """
    position: str | None = None
    last_device: str | None = None
    last_format: str | None = None
    fraction: float | None = None
    last_read_at: str | None = None
    version: int = 0


class ProgressSaveResponse(BaseModel):
    """Response for PUT /api/reader/progress/{book_id}.

    Three branch shapes (accepted/rejected/retry_exhausted) unified into one
    model with optional fields. FastAPI serializes None fields as null — this
    matches the pre-L4 inline dict passthrough where absent keys were simply
    not present. We use response_model_exclude_none=True on the endpoint to
    omit None fields and match pre-L4 wire format exactly.
    """
    accepted: bool
    version: int | None = None
    rebased: bool | None = None
    retry_exhausted: bool | None = None
    current: Any | None = None
