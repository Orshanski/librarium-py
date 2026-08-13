-- name: touch_book(id)!
UPDATE books SET updated_at = CURRENT_TIMESTAMP WHERE id = :id
