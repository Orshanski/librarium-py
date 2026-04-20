-- name: get_user_by_id(id)^
SELECT id, username, display_name, email, role, created_at FROM users WHERE id = :id
