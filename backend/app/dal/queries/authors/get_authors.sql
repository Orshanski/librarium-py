-- name: get_authors()
--
-- Паттерн «производная таблица + DISTINCT + json_group_array(... ORDER BY ...)»:
-- DISTINCT в подзапросе дедуплицирует — у автора может быть несколько книг с одним
-- тегом, без DISTINCT внешний агрегат строит дубли (json_group_array DISTINCT-keyword
-- SQLite не поддерживает).
-- Сортировка через ORDER BY внутри агрегата (формально гарантировано с SQLite 3.44):
-- подача рядов в агрегат идёт по name. Подзапрос возвращает unordered DISTINCT-ряды;
-- порядок задаёт агрегат.
SELECT a.id, a.name, a.sort_name,
    COUNT(DISTINCT b.id) as book_count,
    (SELECT json_group_array(json_object('id', id, 'name', name) ORDER BY name)
     FROM (SELECT DISTINCT t.id, t.name
           FROM book_authors ba2
           JOIN book_tags bt2 ON ba2.book_id = bt2.book_id
           JOIN tags t ON bt2.tag_id = t.id
           WHERE ba2.author_id = a.id)) AS tags
FROM authors a
JOIN book_authors ba ON a.id = ba.author_id
JOIN books b ON ba.book_id = b.id
{where_clause} GROUP BY a.id ORDER BY a.sort_name COLLATE NOCASE
