-- name: find_duplicates_by_title(pattern)
SELECT b.id, b.title,
    (SELECT json_group_array(json_object('id', a.id, 'name', a.name) ORDER BY a.name)
     FROM book_authors ba JOIN authors a ON ba.author_id = a.id
     WHERE ba.book_id = b.id) AS authors
FROM books b
WHERE lower_utf8(b.title) LIKE :pattern ESCAPE '\'
LIMIT 5
