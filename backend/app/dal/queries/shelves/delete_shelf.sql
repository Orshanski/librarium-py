-- name: delete_shelf(id)!
DELETE FROM shelves WHERE id = :id AND is_system = 0
