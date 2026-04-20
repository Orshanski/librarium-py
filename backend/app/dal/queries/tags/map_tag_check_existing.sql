-- name: map_tag_check_existing(name, id)^
SELECT id FROM tags WHERE name = :name AND id != :id
