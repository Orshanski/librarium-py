-- name: get_admin_role(id)^
SELECT role FROM users WHERE id = :id
