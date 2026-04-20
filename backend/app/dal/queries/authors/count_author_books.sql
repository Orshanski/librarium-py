-- name: count_author_books(id)^
SELECT COUNT(*) as c FROM book_authors WHERE author_id = :id
