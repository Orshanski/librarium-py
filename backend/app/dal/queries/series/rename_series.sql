-- name: rename_series(name, id)!
UPDATE series SET name = :name, sort_name = :name WHERE id = :id
