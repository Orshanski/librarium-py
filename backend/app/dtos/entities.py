"""Entity (authors, series, tags) request DTOs and Response DTOs."""
from typing import TypedDict

from pydantic import BaseModel, ConfigDict, Field

from ._refs import AuthorRef, SeriesRef, TagRef
from .books import BookItem
from .catalog import LanguageOptionRow


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
    tags: list[TagRef]


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
    authors: list[AuthorRef]


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

class TagSummaryRow(TypedDict):
    """DAL-level форма тега, raw row из SELECT * FROM tags. Snake keys."""
    id: int
    name: str
    code: str | None


class TagSummary(BaseModel):
    """Заголовок тега на wire в camelCase — поле tag в ответе /api/tags/{id}."""
    id: int
    name: str
    code: str | None = None


class TagDetailBookRow(TypedDict):
    """Book row inside dal.tags.get_tag_by_id books list.

    Extends the EntityBookRow shape with rating and is_read from the
    user_books JOIN present in get_tag_books.sql. Option A (separate TypedDict)
    is chosen over reusing ShelfBookRow to avoid cross-coupling between the
    shelves and tags modules — they share the same SQL pattern but belong to
    different domain boundaries.

    Authors and tags are parsed JSON arrays (list[AuthorRef] / list[TagRef]).
    Series is a parsed JSON object (SeriesRef) or None."""
    id: int
    title: str
    sort_title: str | None
    description: str | None
    language: str | None
    publisher: str | None
    pub_date: str | None
    series_number: float | None
    cover_path: str | None
    added_at: str
    updated_at: str
    series: SeriesRef | None
    authors: list[AuthorRef]
    tags: list[TagRef]
    rating: int | None
    is_read: int | None


class TagDetailRow(TypedDict):
    """Return shape of dal.tags.get_tag_by_id."""
    tag: TagSummaryRow
    books: list[TagDetailBookRow]


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
    """Book row used by author-detail and series-detail DAL functions
    (get_author_by_id, get_series_by_id). Both queries select identical columns:
    explicit b.* fields, series as json_object, authors/tags as json_group_array.
    Single TypedDict justified by R-A: identical SELECT shape across both queries."""
    id: int
    title: str
    sort_title: str | None
    description: str | None
    language: str | None
    publisher: str | None
    pub_date: str | None
    series_number: float | None
    cover_path: str | None
    added_at: str
    updated_at: str
    series: SeriesRef | None
    authors: list[AuthorRef]
    tags: list[TagRef]


# ---------------------------------------------------------------------------
# Response DTOs (L4) — Pydantic, service→router boundary only. R-B: never
# imported from DAL; construction in service layer.
# ---------------------------------------------------------------------------


class AuthorDetailResponse(BaseModel):
    """Response for GET /api/authors/{id}.

    Wire format: {"author": {...}, "books": [...]}.
    `author`: AuthorSummary TypedDict — snake_case scalar keys.
    `books[]`: EntityBookRow TypedDict — snake_case scalars plus nested
    Pydantic refs (`series`, `authors`, `tags`) that serialise as JSON objects.
    """
    author: AuthorSummary
    books: list[EntityBookRow]


class AuthorsListResponse(BaseModel):
    """Response for GET /api/authors."""
    authors: list[AuthorRow]


class SeriesDetailResponse(BaseModel):
    """Response for GET /api/series/{id}.

    Wire format: {"series": {...}, "books": [...]}
    """
    series: SeriesDetailSummary
    books: list[EntityBookRow]


class SeriesListResponse(BaseModel):
    """Response for GET /api/series."""
    series: list[SeriesRow]


class TagDetailResponse(BaseModel):
    """Response for GET /api/tags/{id}.

    Wire format (camelCase): {"tag": {...}, "books": [...]}
    """
    tag: TagSummary
    books: list[BookItem]


class TagCloudResponse(BaseModel):
    """Response for GET /api/tags/cloud."""
    tags: list[TagCloudEntry]


class TagMapResponse(BaseModel):
    """Response for PUT /api/tags/{id}/map.

    Wire format: {"ok": True, "targetId": int}
    `renamed` is present on the object for router-side logging but excluded
    from JSON serialisation via Field(exclude=True).
    """
    ok: bool = True
    targetId: int
    renamed: bool = Field(exclude=True)


class AuthorOptionsResponse(BaseModel):
    """Response for GET /api/filter-options/authors."""
    authors: list[FilterOptionRow]


class TagOptionsResponse(BaseModel):
    """Response for GET /api/filter-options/tags."""
    tags: list[FilterOptionRow]


class SeriesOptionsResponse(BaseModel):
    """Response for GET /api/filter-options/series."""
    series: list[FilterOptionRow]


class LanguageOptionsResponse(BaseModel):
    """Response for GET /api/filter-options/languages."""
    languages: list[LanguageOptionRow]
