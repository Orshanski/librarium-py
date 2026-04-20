-- name: search_books_series()
SELECT s.id, s.name, COUNT(b.id) AS book_count,
       GROUP_CONCAT(DISTINCT a.name) AS authors
FROM series s JOIN books b ON b.series_id = s.id
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
GROUP BY s.id
