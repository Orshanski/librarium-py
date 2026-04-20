-- name: delete_book_tags(book_id)!
DELETE FROM book_tags WHERE book_id = :book_id
