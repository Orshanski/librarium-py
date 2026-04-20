-- name: get_shelf_header(id, uid)^
SELECT * FROM shelves WHERE id = :id AND user_id = :uid
