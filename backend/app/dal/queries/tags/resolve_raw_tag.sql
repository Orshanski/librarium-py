-- name: resolve_raw_tag(raw)^
SELECT tag_id FROM tag_mappings WHERE raw_tag = :raw COLLATE NOCASE
