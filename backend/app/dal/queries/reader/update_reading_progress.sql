-- name: update_reading_progress(uid, bid, pos, dev, fmt, frac, now, ver)!
UPDATE reading_progress SET position = :pos, last_device = :dev, last_format = :fmt,     fraction = :frac, last_read_at = :now, version = version + 1 WHERE user_id = :uid AND book_id = :bid AND version = :ver
