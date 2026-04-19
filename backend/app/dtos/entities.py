"""Entity (authors, series, tags) request DTOs."""
from typing import TypedDict

from pydantic import BaseModel, ConfigDict, Field


class RenameBody(BaseModel):
    name: str


class MergeBody(BaseModel):
    sourceId: int


class MapBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Read-path TypedDicts — one per distinct SELECT shape (R-A: no unification
# of structurally different shapes, no inheritance).
# ---------------------------------------------------------------------------

# --- shared lookup shape ---

class FilterOptionRow(TypedDict):
    """Shared {id, name} shape from list_author_options / list_tag_options /
    list_series_options — three DAL functions with literally identical SELECT,
    one TypedDict reused (same shape, not unified-similar shapes)."""
    id: int
    name: str


# --- author ---

class AuthorRow(TypedDict):
    """Row from dal.authors.get_authors — list shape with book_count + tags aggregate."""
    id: int
    name: str
    sort_name: str | None
    book_count: int
    tags: str | None


class AuthorsList(TypedDict):
    """Return shape of dal.authors.get_authors."""
    authors: list[AuthorRow]


class AuthorSummary(TypedDict):
    """Raw authors table row — SELECT * FROM authors — returned inside get_author_by_id.
    Distinct from AuthorRow: no book_count or tags aggregate columns."""
    id: int
    name: str
    sort_name: str | None


class AuthorDetailRow(TypedDict):
    """Return shape of dal.authors.get_author_by_id."""
    author: AuthorSummary
    books: list["EntityBookRow"]


# --- series ---

class SeriesRow(TypedDict):
    """Row from dal.series.get_series — list shape with book_count + authors aggregate."""
    id: int
    name: str
    sort_name: str | None
    book_count: int
    authors: str | None


class SeriesList(TypedDict):
    """Return shape of dal.series.get_series."""
    series: list[SeriesRow]


class SeriesDetailSummary(TypedDict):
    """Series row inside get_series_by_id — SELECT s.*, COUNT(b.id) as book_count.
    Distinct from SeriesRow: has book_count but no authors aggregate column."""
    id: int
    name: str
    sort_name: str | None
    book_count: int


class SeriesDetailRow(TypedDict):
    """Return shape of dal.series.get_series_by_id."""
    series: SeriesDetailSummary
    books: list["EntityBookRow"]


# --- tag ---

class TagSummary(TypedDict):
    """Raw tags table row — SELECT * FROM tags — returned inside get_tag_by_id.
    Includes the code column present in the tags table schema."""
    id: int
    name: str
    code: str | None


class TagDetailRow(TypedDict):
    """Return shape of dal.tags.get_tag_by_id."""
    tag: TagSummary
    books: list["EntityBookRow"]


class TagCloudEntry(TypedDict):
    """Row from dal.tags.get_tag_cloud — {id, name, book_count}."""
    id: int
    name: str
    book_count: int


class TagMapResult(TypedDict):
    """Return shape of dal.tags.map_tag — renamed flag + resolved target id."""
    renamed: bool
    target_id: int


# --- shared entity-detail book row ---

class EntityBookRow(TypedDict):
    """Book row used by all three entity-detail DAL functions (get_author_by_id,
    get_series_by_id, get_tag_by_id) — all select the same BOOK_LIST_AGGREGATE_COLUMNS:
    b.*, s.name AS series_name, GROUP_CONCAT(authors), GROUP_CONCAT(tags).
    Single TypedDict justified by R-A: identical SELECT shape across all three."""
    id: int
    title: str
    sort_title: str | None
    description: str | None
    language: str | None
    publisher: str | None
    pub_date: str | None
    series_id: int | None
    series_number: float | None
    cover_path: str | None
    added_at: str
    updated_at: str
    series_name: str | None
    authors: str | None
    tags: str | None
