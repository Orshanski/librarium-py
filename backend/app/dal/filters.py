"""Shared WHERE clause builder and filter options for book queries."""
from typing import Literal
from ..database import get_db, dicts_from_rows

FilterEntity = Literal["author", "tag", "series", "language"]


def build_book_where(
    filters: dict,
    *,
    exclude: str | None = None,
    extra_clauses: list[tuple[str, dict]] | None = None,
) -> tuple[str, dict]:
    """Build WHERE clause for queries filtering through the books table.

    Supported filter keys: userId, authorIds, tagIds, seriesIds, language.

    Args:
        filters: dict with filter keys/values
        exclude: optional key to skip (for cross-dimension filter options)
        extra_clauses: additional (sql_fragment, params_dict) tuples.
            Param names must not collide with built-in: uid, a0..aN, t0..tN, s0..sN, lang.

    Returns:
        (where_sql, params) — where_sql includes "WHERE " prefix or is empty string
    """
    effective = {k: v for k, v in filters.items() if k != exclude} if exclude else filters
    clauses: list[str] = []
    params: dict = {}

    if extra_clauses:
        for sql, p in extra_clauses:
            clauses.append(sql)
            params.update(p)

    if uid := effective.get("userId"):
        clauses.append("b.id NOT IN (SELECT book_id FROM user_books WHERE user_id = :uid AND is_hidden = 1)")
        params["uid"] = uid

    if author_ids := effective.get("authorIds"):
        ph = ",".join(f":a{i}" for i in range(len(author_ids)))
        clauses.append(f"b.id IN (SELECT book_id FROM book_authors WHERE author_id IN ({ph}))")
        for i, v in enumerate(author_ids):
            params[f"a{i}"] = v

    if tag_ids := effective.get("tagIds"):
        ph = ",".join(f":t{i}" for i in range(len(tag_ids)))
        clauses.append(f"b.id IN (SELECT book_id FROM book_tags WHERE tag_id IN ({ph}))")
        for i, v in enumerate(tag_ids):
            params[f"t{i}"] = v

    if series_ids := effective.get("seriesIds"):
        ph = ",".join(f":s{i}" for i in range(len(series_ids)))
        clauses.append(f"b.series_id IN ({ph})")
        for i, v in enumerate(series_ids):
            params[f"s{i}"] = v

    if lang := effective.get("language"):
        clauses.append("b.language = :lang")
        params["lang"] = lang

    if not clauses:
        return "", params
    return "WHERE " + " AND ".join(clauses), params


def get_filter_options(filters: dict, entity: FilterEntity) -> list[dict]:
    """Available filter options for entity, scoped by current filters (excluding own dimension).

    Returns:
        author/tag/series: [{id, name}, ...] sorted alphabetically
        language: [{name}, ...] sorted alphabetically
    """
    exclude_key = {"author": "authorIds", "tag": "tagIds", "series": "seriesIds", "language": "language"}[entity]
    where, params = build_book_where(filters, exclude=exclude_key)
    db = get_db()

    if entity == "author":
        sql = f"""
            SELECT DISTINCT a.id, a.name FROM authors a
            JOIN book_authors ba ON a.id = ba.author_id JOIN books b ON ba.book_id = b.id
            {where} ORDER BY a.sort_name COLLATE NOCASE
        """
    elif entity == "tag":
        sql = f"""
            SELECT DISTINCT t.id, t.name FROM tags t
            JOIN book_tags bt ON t.id = bt.tag_id JOIN books b ON bt.book_id = b.id
            {where} ORDER BY t.name COLLATE NOCASE
        """
    elif entity == "series":
        sql = f"""
            SELECT DISTINCT s.id, s.name FROM series s
            JOIN books b ON b.series_id = s.id
            {where} ORDER BY s.name COLLATE NOCASE
        """
    elif entity == "language":
        lang_where = f"{where} AND b.language IS NOT NULL" if where else "WHERE b.language IS NOT NULL"
        sql = f"""
            SELECT DISTINCT b.language as name FROM books b
            {lang_where} ORDER BY b.language COLLATE NOCASE
        """
    else:
        raise ValueError(f"Unknown entity: {entity}")

    return dicts_from_rows(db.execute(sql, params).fetchall())
