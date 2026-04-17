"""
Canonical book-listing SELECT fragment shared across entity-detail DAL queries
(authors, series, tags, shelves). The per-book author / tag aggregation uses
ORDER BY <name> inside GROUP_CONCAT so rendered chips are stable across runs.
Requires SQLite 3.44+.

Sorting contract (applies to EVERY GROUP_CONCAT in this epic, including the
four in `dal.books._BOOK_SELECT`): inputs are ordered by the human-readable
.name column, NEVER by .id. Entity-detail endpoints intentionally expose only
`authors` / `tags` (the id arrays `author_ids` / `tag_ids` live in `books.py`
and are out-of-scope for entity endpoints per E5 spec). If a future consumer
adds id columns here, it MUST also sort them by `a.name` / `t.name` so that
`names[i] ↔ ids[i]` pair correctly for frontend clickable chips. See
`dal.books._BOOK_SELECT` for the already-correct four-column pattern.

Aliasing convention: aggregation JOINs use bare aliases (`ba`, `a`, `bt`, `t`).
Filtering JOINs in consumers must use the `_scope` suffix (e.g. `ba_scope`)
to avoid aliasing conflicts with the aggregation joins.
"""

BOOK_LIST_JOINS = """
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN book_tags bt ON b.id = bt.book_id
LEFT JOIN tags t ON bt.tag_id = t.id
"""

BOOK_LIST_AGGREGATE_COLUMNS = """
b.*, s.name AS series_name,
GROUP_CONCAT(DISTINCT a.name ORDER BY a.name) AS authors,
GROUP_CONCAT(DISTINCT t.name ORDER BY t.name) AS tags
"""
