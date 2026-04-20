-- name: rename_author(name, sort, id)!
UPDATE authors SET name = :name, sort_name = :sort WHERE id = :id
