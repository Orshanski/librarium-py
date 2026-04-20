-- name: insert_system_shelf(name, uid, code)!
INSERT INTO shelves (name, user_id, is_system, system_code) VALUES (:name, :uid, 1, :code)
