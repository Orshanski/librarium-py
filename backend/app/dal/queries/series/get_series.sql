-- name: get_series()
SELECT s.id, s.name, s.sort_name, COUNT(DISTINCT b.id) as book_count,
    GROUP_CONCAT(DISTINCT a.name) as authors
FROM series s
JOIN books b ON b.series_id = s.id
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
{where_clause} GROUP BY s.id ORDER BY s.sort_name COLLATE NOCASE
