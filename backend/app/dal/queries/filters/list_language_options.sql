-- name: list_language_options()
SELECT DISTINCT b.language as name FROM books b
{where_clause} ORDER BY b.language COLLATE NOCASE;
