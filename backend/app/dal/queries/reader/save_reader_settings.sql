-- name: save_reader_settings(uid, dt, s)!
INSERT INTO reader_settings (user_id, device_type, settings)
        VALUES (:uid, :dt, :s)
        ON CONFLICT(user_id, device_type) DO UPDATE SET settings = :s
