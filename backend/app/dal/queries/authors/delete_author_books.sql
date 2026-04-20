-- name: delete_author_books(source)!
DELETE FROM book_authors WHERE author_id = :source
