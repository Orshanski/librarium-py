-- name: find_duplicates_by_title(pattern)
SELECT b.id, b.title, GROUP_CONCAT(DISTINCT a.name) AS authors
FROM books b
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
WHERE lower_utf8(b.title) LIKE :pattern ESCAPE '\'
GROUP BY b.id LIMIT 5
