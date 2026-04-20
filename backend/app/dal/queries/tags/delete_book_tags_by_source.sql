-- name: delete_book_tags_by_source(source)!
DELETE FROM book_tags WHERE tag_id = :source
