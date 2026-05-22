-- name: delete_tag_mappings_by_target(target)!
DELETE FROM tag_mappings WHERE tag_id = :target
