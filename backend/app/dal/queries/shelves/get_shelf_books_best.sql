-- name: get_shelf_books_best(uid)
-- Explicit columns instead of b.* to control the output shape.
-- series is a JSON object (SeriesRef) or NULL, not a flat series_name column.
-- authors/tags are json_group_array of JSON objects (AuthorRef/TagRef), not GROUP_CONCAT strings.
-- Top-level LEFT JOIN authors (alias a) is kept for authorAsc/authorDesc sort via MIN(a.sort_name);
-- correlated subqueries use distinct aliases (ba_sub, a_sub, bt_sub, t_sub) to avoid conflict.
-- GROUP BY b.id collapses the author-join fanout.
SELECT
    b.id, b.title, b.sort_title, b.description, b.language, b.publisher,
    b.pub_date, b.series_number, b.cover_path, b.added_at, b.updated_at,
    CASE WHEN s.id IS NULL THEN NULL
         ELSE json_object('id', s.id, 'name', s.name)
    END AS series,
    (
        SELECT json_group_array(json_object('id', a_sub.id, 'name', a_sub.name) ORDER BY a_sub.name)
        FROM book_authors ba_sub
        JOIN authors a_sub ON ba_sub.author_id = a_sub.id
        WHERE ba_sub.book_id = b.id
    ) AS authors,
    (
        SELECT json_group_array(json_object('id', t_sub.id, 'name', t_sub.name) ORDER BY t_sub.name)
        FROM book_tags bt_sub
        JOIN tags t_sub ON bt_sub.tag_id = t_sub.id
        WHERE bt_sub.book_id = b.id
    ) AS tags,
    ub.rating, ub.is_read
FROM books b
JOIN user_books ub ON b.id = ub.book_id AND ub.user_id = :uid AND ub.rating >= 4
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
GROUP BY b.id
{order_clause}
