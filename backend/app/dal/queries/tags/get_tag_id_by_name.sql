-- name: get_tag_id_by_name(name)^
SELECT id FROM tags WHERE name = :name
