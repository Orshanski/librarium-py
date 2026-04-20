-- name: search_books_books()
SELECT b.id, b.title, b.cover_path,
    GROUP_CONCAT(DISTINCT a.name) AS authors, s.name AS series_name
FROM books b
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN series s ON b.series_id = s.id
GROUP BY b.id
