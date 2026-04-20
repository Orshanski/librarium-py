-- name: update_shelf(n, id)!
UPDATE shelves SET name = :n WHERE id = :id AND is_system = 0
