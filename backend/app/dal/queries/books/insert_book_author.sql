-- name: insert_book_author(book_id, author_id)!
INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES (:book_id, :author_id)
