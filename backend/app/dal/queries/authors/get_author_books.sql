-- name: get_author_books(id, user_id)
SELECT
    b.id, b.title, b.sort_title, b.description, b.language, b.publisher,
    b.pub_date, b.series_number, b.cover_path, b.added_at, b.updated_at,
    CASE WHEN s.id IS NULL THEN NULL
         ELSE json_object('id', s.id, 'name', s.name) END AS series,
    (SELECT json_group_array(json_object('id', a.id, 'name', a.name) ORDER BY a.name)
     FROM book_authors ba2 JOIN authors a ON ba2.author_id = a.id
     WHERE ba2.book_id = b.id) AS authors,
    (SELECT json_group_array(json_object('id', t.id, 'name', t.name) ORDER BY t.name)
     FROM book_tags bt JOIN tags t ON bt.tag_id = t.id
     WHERE bt.book_id = b.id) AS tags,
    ub.rating,
    COALESCE(ub.is_read, 0) AS is_read
FROM books b
JOIN book_authors ba ON b.id = ba.book_id AND ba.author_id = :id
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN user_books ub ON ub.book_id = b.id AND ub.user_id = :user_id
ORDER BY b.added_at DESC
