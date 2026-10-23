-- name: get_publication_rows()
-- Подробные данные книг страницы каталога OPDS одним запросом.
SELECT b.id, b.title, b.description, b.language, b.publisher, b.pub_date,
    b.cover_path, b.updated_at, b.series_number,
    CASE WHEN s.id IS NULL THEN NULL
         ELSE json_object('id', s.id, 'name', s.name) END AS series,
    (SELECT json_group_array(json_object('id', a.id, 'name', a.name, 'sort_name', a.sort_name) ORDER BY a.name)
     FROM book_authors ba JOIN authors a ON ba.author_id = a.id
     WHERE ba.book_id = b.id) AS authors,
    (SELECT json_group_array(json_object('id', t.id, 'name', t.name) ORDER BY t.name)
     FROM book_tags bt JOIN tags t ON bt.tag_id = t.id
     WHERE bt.book_id = b.id) AS tags,
    (SELECT json_group_array(json_object('format', f.format, 'file_size', f.file_size) ORDER BY f.format)
     FROM book_files f WHERE f.book_id = b.id) AS files,
    (SELECT i.value FROM book_identifiers i
     WHERE i.book_id = b.id AND i.type = 'isbn' ORDER BY i.id LIMIT 1) AS isbn
FROM books b
LEFT JOIN series s ON b.series_id = s.id
WHERE b.id IN ({placeholders})
