-- name: insert_user(u, h, r, d, e)<!
INSERT INTO users (username, password_hash, role, display_name, email) VALUES (:u, :h, :r, :d, :e)
