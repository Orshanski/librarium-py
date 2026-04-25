-- Sort contract: authors/tags arrays ordered by .name (json_group_array ORDER BY).
-- author JOIN is kept for authorAsc/authorDesc sort (MIN(a.sort_name)); GROUP BY b.id
-- collapses the fanout. Correlated subqueries for authors/tags/series are unaffected.
-- name: get_books(uid, lim, off)
SELECT b.id, b.title, b.sort_title, b.description, b.language,
    b.publisher, b.pub_date, b.cover_path, b.added_at, b.updated_at,
    b.series_number,
    CASE WHEN s.id IS NULL THEN NULL
         ELSE json_object('id', s.id, 'name', s.name) END AS series,
    (SELECT json_group_array(json_object('id', a2.id, 'name', a2.name) ORDER BY a2.name)
     FROM book_authors ba2 JOIN authors a2 ON ba2.author_id = a2.id
     WHERE ba2.book_id = b.id) AS authors,
    (SELECT json_group_array(json_object('id', t2.id, 'name', t2.name) ORDER BY t2.name)
     FROM book_tags bt2 JOIN tags t2 ON bt2.tag_id = t2.id
     WHERE bt2.book_id = b.id) AS tags,
    ub.rating, ub.is_read
FROM books b
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN user_books ub ON b.id = ub.book_id AND ub.user_id = :uid
{where_clause}
GROUP BY b.id
{order_clause}
LIMIT :lim OFFSET :off
