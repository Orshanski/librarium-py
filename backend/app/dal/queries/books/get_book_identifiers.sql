-- name: get_book_identifiers(book_id)
SELECT type, value FROM book_identifiers WHERE book_id = :book_id
