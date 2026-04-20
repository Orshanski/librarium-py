-- name: get_all_users()
SELECT id, username, display_name, email, role, created_at FROM users ORDER BY id
