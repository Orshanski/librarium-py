-- name: map_tag_check_existing(name, id)^
-- COLLATE NOCASE: collision check must be case-insensitive — иначе rename "Иные миры"→"иные миры"
-- проскочит как simple rename и сломает write-инвариант (Capitalized в tags.name).
-- Caller normalizes target_name via normalize_tag_name перед вызовом, NOCASE — defense in depth.
SELECT id FROM tags WHERE name = :name COLLATE NOCASE AND id != :id
