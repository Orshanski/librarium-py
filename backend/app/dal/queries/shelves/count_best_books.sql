-- name: count_best_books(uid)^
SELECT COUNT(*) as cnt FROM user_books WHERE user_id = :uid AND rating >= 4
