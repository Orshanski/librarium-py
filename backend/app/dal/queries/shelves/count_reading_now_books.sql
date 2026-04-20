-- name: count_reading_now_books(uid)^
SELECT COUNT(*) as cnt FROM reading_progress rp
LEFT JOIN user_books ub ON rp.book_id = ub.book_id AND ub.user_id = :uid
WHERE rp.user_id = :uid AND rp.position IS NOT NULL
    AND (ub.is_read IS NULL OR ub.is_read != 1)
