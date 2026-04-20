-- name: update_cover_path(id, cover_path)!
UPDATE books SET cover_path = :cover_path, updated_at = CURRENT_TIMESTAMP WHERE id = :id
