-- name: insert_book_tags_from_source(target, source)!
INSERT OR IGNORE INTO book_tags (book_id, tag_id)
SELECT book_id, :target FROM book_tags WHERE tag_id = :source
