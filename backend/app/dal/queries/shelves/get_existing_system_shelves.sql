-- name: get_existing_system_shelves(uid)
SELECT system_code FROM shelves WHERE user_id = :uid AND is_system = 1
