-- name: get_authors()
SELECT a.id, a.name, a.sort_name,
    COUNT(DISTINCT b.id) as book_count,
    (SELECT json_group_array(json_object('id', id, 'name', name))
     FROM (SELECT DISTINCT t.id, t.name
           FROM book_authors ba2
           JOIN book_tags bt2 ON ba2.book_id = bt2.book_id
           JOIN tags t ON bt2.tag_id = t.id
           WHERE ba2.author_id = a.id
           ORDER BY t.name)) AS tags
FROM authors a
JOIN book_authors ba ON a.id = ba.author_id
JOIN books b ON ba.book_id = b.id
{where_clause} GROUP BY a.id ORDER BY a.sort_name COLLATE NOCASE
