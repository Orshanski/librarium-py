-- name: book_file_exists(book_id, format)^
SELECT id FROM book_files WHERE book_id = :book_id AND format = :format
