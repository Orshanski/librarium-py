-- name: update_tag_mappings_target(target, source)!
UPDATE tag_mappings SET tag_id = :target WHERE tag_id = :source
