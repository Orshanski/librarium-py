-- name: add_book_file(book_id, format, file_path, file_size)<!
INSERT OR IGNORE INTO book_files (book_id, format, file_path, file_size) VALUES (:book_id, :format, :file_path, :file_size)
