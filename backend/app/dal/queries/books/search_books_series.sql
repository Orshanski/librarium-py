-- name: search_books_series()
--
-- Паттерн «производная таблица + DISTINCT + json_group_array»:
-- DISTINCT нужен, потому что у серии может быть несколько книг одного автора —
-- без него json_group_array создаёт дубли. Конструкция json_group_array(... DISTINCT ...)
-- не поддерживается SQLite, поэтому дедупликация выносится в производную таблицу (подзапрос).
-- ORDER BY внутри производной таблицы сохраняется внешним json_group_array как
-- деталь реализации SQLite; поведение покрыто регрессионными тестами в test_search.py.
SELECT s.id, s.name, COUNT(DISTINCT b.id) AS book_count,
    (SELECT json_group_array(json_object('id', id, 'name', name))
     FROM (SELECT DISTINCT a.id, a.name
           FROM books b2
           JOIN book_authors ba ON b2.id = ba.book_id
           JOIN authors a ON ba.author_id = a.id
           WHERE b2.series_id = s.id
           ORDER BY a.name)) AS authors
FROM series s
JOIN books b ON b.series_id = s.id
GROUP BY s.id
