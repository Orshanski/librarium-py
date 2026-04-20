-- name: get_tag_cloud()
SELECT t.id, t.name, COUNT(bt.book_id) as book_count
FROM tags t JOIN book_tags bt ON t.id = bt.tag_id
GROUP BY t.id ORDER BY book_count DESC {limit_clause}
