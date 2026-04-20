-- name: delete_book_identifier_isbn(book_id)!
DELETE FROM book_identifiers WHERE book_id = :book_id AND type = 'isbn'
