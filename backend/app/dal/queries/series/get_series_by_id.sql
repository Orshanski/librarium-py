-- name: get_series_by_id(id)^
--
-- Агрегат authors повторяет паттерн get_series.sql: производная таблица с DISTINCT
-- (в серии может быть несколько книг одного автора, а json_group_array не знает
-- ключевого слова DISTINCT) и сортировка через ORDER BY внутри агрегата.
SELECT s.*, COUNT(b.id) as book_count,
    (SELECT json_group_array(json_object('id', id, 'name', name) ORDER BY name)
     FROM (SELECT DISTINCT a.id, a.name
           FROM books b2
           JOIN book_authors ba ON b2.id = ba.book_id
           JOIN authors a ON ba.author_id = a.id
           WHERE b2.series_id = s.id)) AS authors
FROM series s
LEFT JOIN books b ON b.series_id = s.id
WHERE s.id = :id
GROUP BY s.id
