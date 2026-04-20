-- name: get_setting(k)^
SELECT value FROM settings WHERE key = :k
