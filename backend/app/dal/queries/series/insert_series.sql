-- name: insert_series(name, sort)!
INSERT OR IGNORE INTO series (name, sort_name) VALUES (:name, :sort)
