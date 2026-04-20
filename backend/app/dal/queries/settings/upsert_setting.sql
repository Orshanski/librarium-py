-- name: upsert_setting(k, v)!
INSERT OR REPLACE INTO settings (key, value) VALUES (:k, :v)
