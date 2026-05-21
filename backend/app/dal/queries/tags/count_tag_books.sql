-- name: count_tag_books(id)^
SELECT COUNT(*) as c FROM book_tags WHERE tag_id = :id
