-- name: insert_author(name, sort)!
INSERT OR IGNORE INTO authors (name, sort_name) VALUES (:name, :sort)
