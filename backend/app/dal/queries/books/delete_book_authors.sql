-- name: delete_book_authors(book_id)!
DELETE FROM book_authors WHERE book_id = :book_id
