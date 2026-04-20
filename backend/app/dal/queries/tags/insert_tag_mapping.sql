-- name: insert_tag_mapping(raw, tid)!
INSERT OR IGNORE INTO tag_mappings (raw_tag, tag_id) VALUES (:raw, :tid)
