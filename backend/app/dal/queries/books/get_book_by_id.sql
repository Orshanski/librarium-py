-- Sort contract: authors/tags aggregated GROUP_CONCAT ordered by .name (not .id)
-- so names[i] ↔ ids[i] pair correctly for frontend chips.
-- author_ids ordered by a.name (same axis as authors), tag_ids by t.name.
-- name: get_book_by_id(id, uid)^
SELECT b.*, s.name AS series_name,
    GROUP_CONCAT(DISTINCT a.name ORDER BY a.name) AS authors,
    GROUP_CONCAT(DISTINCT a.id   ORDER BY a.name) AS author_ids,
    GROUP_CONCAT(DISTINCT t.name ORDER BY t.name) AS tags,
    GROUP_CONCAT(DISTINCT t.id   ORDER BY t.name) AS tag_ids,
    ub.rating, ub.is_read
FROM books b
LEFT JOIN series s ON b.series_id = s.id
LEFT JOIN book_authors ba ON b.id = ba.book_id
LEFT JOIN authors a ON ba.author_id = a.id
LEFT JOIN book_tags bt ON b.id = bt.book_id
LEFT JOIN tags t ON bt.tag_id = t.id
LEFT JOIN user_books ub ON b.id = ub.book_id AND ub.user_id = :uid
WHERE b.id = :id
GROUP BY b.id
