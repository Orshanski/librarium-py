-- name: resolve_tag_name(raw)^
SELECT t.name FROM tag_mappings m JOIN tags t ON m.tag_id = t.id WHERE m.raw_tag = :raw COLLATE NOCASE
