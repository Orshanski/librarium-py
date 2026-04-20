-- name: insert_book_identifier(book_id, type, value)!
INSERT INTO book_identifiers (book_id, type, value) VALUES (:book_id, :type, :value)
