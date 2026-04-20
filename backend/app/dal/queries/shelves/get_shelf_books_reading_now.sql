-- name: get_shelf_books_reading_now(uid)
SELECT b.*, s.name AS series_name,
GROUP_CONCAT(DISTINCT a.name ORDER BY a.name) AS authors,
GROUP_CONCAT(DISTINCT t.name ORDER BY t.name) AS tags
,
    rp.fraction, rp.last_format, rp.last_read_at
FROM books b
JOIN reading_progress rp ON b.id = rp.book_id AND rp.user_id = :uid AND rp.position IS NOT NULL
LEFT JOIN user_books ub ON b.id = ub.book_id AND ub.user_id = :uid
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN book_tags bt ON b.id = bt.book_id
LEFT JOIN tags t ON bt.tag_id = t.id
WHERE (ub.is_read IS NULL OR ub.is_read != 1)
GROUP BY b.id ORDER BY rp.last_read_at DESC
