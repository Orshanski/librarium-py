-- name: get_tag_name_by_id(id)^
SELECT name FROM tags WHERE id = :id
