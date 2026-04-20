-- name: get_authors()
SELECT a.id, a.name, a.sort_name, COUNT(DISTINCT b.id) as book_count,
    GROUP_CONCAT(DISTINCT t.name) as tags
FROM authors a
JOIN book_authors ba ON a.id = ba.author_id
JOIN books b ON ba.book_id = b.id
LEFT JOIN book_tags bt ON b.id = bt.book_id
LEFT JOIN tags t ON bt.tag_id = t.id
{where_clause} GROUP BY a.id ORDER BY a.sort_name COLLATE NOCASE
