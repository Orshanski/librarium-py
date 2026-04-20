-- name: insert_book_tag(book_id, tag_id)!
INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (:book_id, :tag_id)
