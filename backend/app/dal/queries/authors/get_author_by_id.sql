-- name: get_author_by_id(id)^
--
-- Агрегат tags повторяет паттерн get_authors.sql: производная таблица с DISTINCT
-- (у автора может быть несколько книг с одним тегом, а json_group_array не знает
-- ключевого слова DISTINCT) и сортировка через ORDER BY внутри агрегата.
SELECT a.*, COUNT(DISTINCT b.id) as book_count,
    (SELECT json_group_array(json_object('id', id, 'name', name) ORDER BY name)
     FROM (SELECT DISTINCT t.id, t.name
           FROM book_authors ba2
           JOIN book_tags bt2 ON ba2.book_id = bt2.book_id
           JOIN tags t ON bt2.tag_id = t.id
           WHERE ba2.author_id = a.id)) AS tags
FROM authors a
LEFT JOIN book_authors ba ON ba.author_id = a.id
LEFT JOIN books b ON b.id = ba.book_id
WHERE a.id = :id
GROUP BY a.id
