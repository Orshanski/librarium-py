-- name: list_author_options()
SELECT DISTINCT a.id, a.name FROM authors a
JOIN book_authors ba ON a.id = ba.author_id
JOIN books b ON ba.book_id = b.id
{where_clause} ORDER BY a.sort_name COLLATE NOCASE
