-- name: insert_reading_progress(uid, bid, pos, dev, fmt, frac, now)!
INSERT INTO reading_progress (user_id, book_id, position, last_device, last_format, fraction, last_read_at, version) VALUES (:uid, :bid, :pos, :dev, :fmt, :frac, :now, 1) ON CONFLICT(user_id, book_id) DO NOTHING
