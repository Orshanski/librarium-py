-- name: count_admins()^
SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'
