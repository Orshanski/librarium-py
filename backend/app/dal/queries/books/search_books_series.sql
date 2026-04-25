-- name: search_books_series()
--
-- Паттерн «производная таблица + DISTINCT + json_group_array(... ORDER BY ...)»:
-- DISTINCT в подзапросе дедуплицирует — у серии может быть несколько книг одного
-- автора, без DISTINCT внешний агрегат строит дубли (json_group_array DISTINCT-keyword
-- SQLite не поддерживает).
-- Сортировка через ORDER BY внутри агрегата (формально гарантировано с SQLite 3.44):
-- подача рядов в агрегат идёт по name. Подзапрос возвращает unordered DISTINCT-ряды;
-- порядок задаёт агрегат.
SELECT s.id, s.name, COUNT(DISTINCT b.id) AS book_count,
    (SELECT json_group_array(json_object('id', id, 'name', name) ORDER BY name)
     FROM (SELECT DISTINCT a.id, a.name
           FROM books b2
           JOIN book_authors ba ON b2.id = ba.book_id
           JOIN authors a ON ba.author_id = a.id
           WHERE b2.series_id = s.id)) AS authors
FROM series s
JOIN books b ON b.series_id = s.id
GROUP BY s.id
