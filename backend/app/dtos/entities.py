"""Entity (authors, series, tags) request DTOs and Response DTOs."""
from typing import TypedDict

from pydantic import BaseModel, ConfigDict, Field

from ._aliases import to_camel
from ._refs import AuthorRef, SeriesRef, TagRef
from .books import BookItem, RESPONSE_CONFIG
from .catalog import LanguageOptionRow

_BODY_CONFIG = ConfigDict(populate_by_name=False, alias_generator=to_camel, extra="forbid")


class RenameBody(BaseModel):
    model_config = _BODY_CONFIG
    name: str


class MergeBody(BaseModel):
    model_config = _BODY_CONFIG
    source_id: int


class MapBody(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        populate_by_name=False,
        alias_generator=to_camel,
        extra="forbid",
    )
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


class EntityBookItem(BaseModel):
    """Book item in author-detail and series-detail responses. Snake-case Python
    fields; serialises to camelCase wire via alias_generator. Accepts snake keys
    from DAL TypedDicts (populate_by_name=True) for construction in service layer."""
    model_config = RESPONSE_CONFIG

    id: int
    title: str
    sort_title: str | None = None
    pub_date: str | None = None
    series: SeriesRef | None = None
    series_number: float | None = None
    cover_path: str | None = None
    added_at: str
    updated_at: str
    authors: list[AuthorRef]
    tags: list[TagRef]


class TagDetailBookItem(BaseModel):
    """Book item in tag-detail response. Extends EntityBookItem shape with
    user-specific rating/is_read from the user_books JOIN in get_tag_books.sql."""
    model_config = RESPONSE_CONFIG

    id: int
    title: str
    sort_title: str | None = None
    pub_date: str | None = None
    series: SeriesRef | None = None
    series_number: float | None = None
    cover_path: str | None = None
    added_at: str
    updated_at: str
    authors: list[AuthorRef]
    tags: list[TagRef]
    rating: int | None = None
    is_read: int | None = None


class AuthorDetailResponse(BaseModel):
    """Response for GET /api/authors/{id}.

    Wire format (camelCase): {"author": {...}, "books": [...]}.
    `books[]`: EntityBookItem (snake fields, camel wire).
    """
    model_config = RESPONSE_CONFIG

    author: AuthorSummary
    books: list[EntityBookItem]


class AuthorsListResponse(BaseModel):
    """Response for GET /api/authors."""
    model_config = RESPONSE_CONFIG

    authors: list[AuthorRow]


class SeriesDetailResponse(BaseModel):
    """Response for GET /api/series/{id}.

    Wire format (camelCase): {"series": {...}, "books": [...]}
    """
    model_config = RESPONSE_CONFIG

    series: SeriesDetailSummary
    books: list[EntityBookItem]


class SeriesListResponse(BaseModel):
    """Response for GET /api/series."""
    model_config = RESPONSE_CONFIG

    series: list[SeriesRow]


class TagDetailResponse(BaseModel):
    """Response for GET /api/tags/{id}.

    Wire format (camelCase): {"tag": {...}, "books": [...]}
    """
    model_config = RESPONSE_CONFIG

    tag: TagSummary
    books: list[TagDetailBookItem]


class TagCloudResponse(BaseModel):
    """Response for GET /api/tags/cloud."""
    model_config = RESPONSE_CONFIG

    tags: list[TagCloudEntry]


class TagMapResponse(BaseModel):
    """Response for PUT /api/tags/{id}/map.

    Wire format: {"ok": True, "targetId": int}
    `renamed` is present on the object for router-side logging but excluded
    from JSON serialisation via Field(exclude=True).
    """
    model_config = RESPONSE_CONFIG

    ok: bool = True
    target_id: int
    renamed: bool = Field(exclude=True)


class AuthorOptionsResponse(BaseModel):
    """Response for GET /api/filter-options/authors."""
    model_config = RESPONSE_CONFIG

    authors: list[FilterOptionRow]


class TagOptionsResponse(BaseModel):
    """Response for GET /api/filter-options/tags."""
    model_config = RESPONSE_CONFIG

    tags: list[FilterOptionRow]


class SeriesOptionsResponse(BaseModel):
    """Response for GET /api/filter-options/series."""
    model_config = RESPONSE_CONFIG

    series: list[FilterOptionRow]


class LanguageOptionsResponse(BaseModel):
    """Response for GET /api/filter-options/languages."""
    model_config = RESPONSE_CONFIG

    languages: list[LanguageOptionRow]
