"""Shared WHERE clause builder for book queries."""


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
        extra_clauses: additional (sql_fragment, params_dict) tuples

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
