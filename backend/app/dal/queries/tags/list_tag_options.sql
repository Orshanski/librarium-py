-- name: list_tag_options()
SELECT DISTINCT t.id, t.name FROM tags t
JOIN book_tags bt ON t.id = bt.tag_id
JOIN books b ON bt.book_id = b.id
{where_clause} ORDER BY t.name COLLATE NOCASE
