-- name: search_books_books(user_id)
SELECT b.id, b.title, b.cover_path, b.series_number, b.updated_at,
    CASE WHEN s.id IS NULL THEN NULL
         ELSE json_object('id', s.id, 'name', s.name) END AS series,
    (SELECT json_group_array(json_object('id', a.id, 'name', a.name) ORDER BY a.name)
     FROM book_authors ba JOIN authors a ON ba.author_id = a.id
     WHERE ba.book_id = b.id) AS authors,
    ub.rating,
    COALESCE(ub.is_read, 0) AS is_read
FROM books b
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN user_books ub ON ub.book_id = b.id AND ub.user_id = :user_id
