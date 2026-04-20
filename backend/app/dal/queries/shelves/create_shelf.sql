-- name: create_shelf(n, uid)<!
INSERT INTO shelves (name, user_id) VALUES (:n, :uid)
