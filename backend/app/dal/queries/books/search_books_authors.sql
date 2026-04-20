-- name: search_books_authors()
SELECT a.id, a.name, COUNT(ba.book_id) AS book_count
FROM authors a JOIN book_authors ba ON a.id = ba.author_id
GROUP BY a.id
