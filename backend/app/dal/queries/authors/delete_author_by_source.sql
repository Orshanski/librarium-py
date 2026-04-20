-- name: delete_author_by_source(source)!
DELETE FROM authors WHERE id = :source
