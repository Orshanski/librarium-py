import sqlite3

from ..dal.authors import get_or_create_author
from ..dal.series import get_or_create_series
from ..dal.tags import get_or_create_tag


def resolve_authors(db: sqlite3.Connection, raw: str | list) -> list[int]:
    """Resolve authors from comma-separated string or mixed list[int|str] to list of IDs."""
    if isinstance(raw, str):
        return [get_or_create_author(db, a.strip()) for a in raw.split(",") if a.strip()]
    return [get_or_create_author(db, a) if isinstance(a, str) else a for a in raw]


def resolve_tags(db: sqlite3.Connection, raw: str | list) -> list[int]:
    """Resolve tags from comma-separated string or mixed list[int|str] to list of IDs."""
    if isinstance(raw, str):
        return [get_or_create_tag(db, t.strip()) for t in raw.split(",") if t.strip()]
    return [get_or_create_tag(db, t) if isinstance(t, str) else t for t in raw]


def resolve_series(db: sqlite3.Connection, raw: str | int | None) -> int | None:
    """Resolve series from string name, int ID, or None."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    if isinstance(raw, str):
        return get_or_create_series(db, raw.strip())
    return raw
