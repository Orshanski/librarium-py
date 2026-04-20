-- name: get_reader_settings(uid, dt)^
SELECT settings FROM reader_settings WHERE user_id = :uid AND device_type = :dt
