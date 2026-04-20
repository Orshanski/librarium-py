-- name: get_reading_progress(uid, bid)^
SELECT position, last_device, last_format, fraction, last_read_at, version FROM reading_progress WHERE user_id = :uid AND book_id = :bid
