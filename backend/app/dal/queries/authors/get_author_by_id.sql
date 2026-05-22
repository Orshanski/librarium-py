-- name: get_author_by_id(id)^
SELECT a.*, COUNT(DISTINCT b.id) as book_count
FROM authors a
LEFT JOIN book_authors ba ON ba.author_id = a.id
LEFT JOIN books b ON b.id = ba.book_id
WHERE a.id = :id
GROUP BY a.id
