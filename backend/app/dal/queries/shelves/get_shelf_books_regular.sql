-- name: get_shelf_books_regular(id)
SELECT b.*, s.name AS series_name,
GROUP_CONCAT(DISTINCT a.name ORDER BY a.name) AS authors,
GROUP_CONCAT(DISTINCT t.name ORDER BY t.name) AS tags

FROM books b
JOIN shelf_books sb ON b.id = sb.book_id AND sb.shelf_id = :id
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN book_tags bt ON b.id = bt.book_id
LEFT JOIN tags t ON bt.tag_id = t.id
GROUP BY b.id ORDER BY sb.added_at DESC
