-- name: get_book_files(book_id)
SELECT id, format, file_path, file_size FROM book_files WHERE book_id = :book_id
