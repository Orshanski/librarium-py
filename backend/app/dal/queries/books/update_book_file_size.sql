-- name: update_book_file_size(id, file_size)!
UPDATE book_files SET file_size = :file_size WHERE id = :id
