-- name: shelf_exists(id, uid)^
SELECT 1 FROM shelves WHERE id = :id AND user_id = :uid
