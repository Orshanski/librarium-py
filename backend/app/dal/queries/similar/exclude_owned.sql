-- name: exclude_owned()
SELECT lower_utf8(b.title) as title, lower_utf8(MIN(a.name)) as author
FROM books b
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
WHERE lower_utf8(b.title) IN ({placeholders})
GROUP BY b.id
