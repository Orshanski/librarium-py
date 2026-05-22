-- name: get_tag_header(id)^
SELECT t.*, COUNT(DISTINCT b.id) as book_count
FROM tags t
LEFT JOIN book_tags bt ON bt.tag_id = t.id
LEFT JOIN books b ON b.id = bt.book_id
WHERE t.id = :id
GROUP BY t.id
