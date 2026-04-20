-- name: merge_authors_books(target, source)!
INSERT OR IGNORE INTO book_authors (book_id, author_id)
SELECT book_id, :target FROM book_authors WHERE author_id = :source
