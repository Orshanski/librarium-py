-- name: delete_reading_progress(uid, bid)!
DELETE FROM reading_progress WHERE user_id = :uid AND book_id = :bid
