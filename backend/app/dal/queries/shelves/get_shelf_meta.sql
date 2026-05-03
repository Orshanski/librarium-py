-- name: get_shelf_meta(id, uid)^
SELECT id, name, is_system, system_code FROM shelves WHERE id = :id AND user_id = :uid
