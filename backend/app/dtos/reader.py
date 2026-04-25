"""Reader request DTOs and Response DTOs."""
from typing import Annotated, Any, Literal, NotRequired, TypedDict, Union

from pydantic import BaseModel, Field

from ._aliases import BODY_CONFIG, RESPONSE_CONFIG


class ReaderSettingsBody(BaseModel):
    model_config = BODY_CONFIG

    settings: dict[str, Any] = Field(default_factory=dict)


class ReaderSettingsGetResponse(BaseModel):
    """Response for GET /api/reader/settings."""
    settings: dict[str, Any]


class ReadingProgressBody(BaseModel):
    model_config = BODY_CONFIG

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

    Wire: {position, lastDevice, lastFormat, fraction, lastReadAt, version}.
    All fields except version can be None (no-row branch returns zeroed row).
    """
    model_config = RESPONSE_CONFIG

    position: str | None = None
    last_device: str | None = None
    last_format: str | None = None
    fraction: float | None = None
    last_read_at: str | None = None
    version: int = 0


class ProgressAcceptedResponse(BaseModel):
    """Accepted branch of PUT /api/reader/progress/{book_id}.

    Wire: {"accepted": true, "version": N, "rebased": false}.
    """
    model_config = RESPONSE_CONFIG

    accepted: Literal[True]
    version: int
    rebased: bool = False


class ProgressRejectedResponse(BaseModel):
    """Rejected branch of PUT /api/reader/progress/{book_id}.

    Covers the conflict case (current is a ReadingProgressRow dict) and
    the retry-exhausted case (current is None).

    Wire (conflict):        {"accepted": false, "current": {...}, "retryExhausted": false}
    Wire (retry-exhausted): {"accepted": false, "current": null, "retryExhausted": true}
    """
    model_config = RESPONSE_CONFIG

    accepted: Literal[False]
    current: ReadingProgressRow | None  # always present — None for retry_exhausted
    # DAL emits retry_exhausted=True only on the retry-exhausted branch
    # (all 3 race-retries failed). On conflict-rewind reject the flag
    # is absent and this default activates to False — that is by design.
    retry_exhausted: bool = False


ProgressSaveResponse = Annotated[
    Union[ProgressAcceptedResponse, ProgressRejectedResponse],
    Field(discriminator="accepted"),
]
