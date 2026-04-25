-- name: get_series_books(id)
SELECT
    b.id, b.title, b.sort_title, b.description, b.language, b.publisher,
    b.pub_date, b.series_number, b.cover_path, b.added_at, b.updated_at,
    CASE WHEN s.id IS NULL THEN NULL
         ELSE json_object('id', s.id, 'name', s.name) END AS series,
    (SELECT json_group_array(json_object('id', a.id, 'name', a.name) ORDER BY a.name)
     FROM book_authors ba JOIN authors a ON ba.author_id = a.id
     WHERE ba.book_id = b.id) AS authors,
    (SELECT json_group_array(json_object('id', t.id, 'name', t.name) ORDER BY t.name)
     FROM book_tags bt JOIN tags t ON bt.tag_id = t.id
     WHERE bt.book_id = b.id) AS tags
FROM books b
LEFT JOIN series s ON b.series_id = s.id
WHERE b.series_id = :id
ORDER BY b.series_number
