-- name: get_book_file(book_id, format)^
SELECT id, file_path FROM book_files WHERE book_id = :book_id AND format = :format
