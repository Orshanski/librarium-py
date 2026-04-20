-- name: set_rating(uid, bid, r)!
INSERT INTO user_books (user_id, book_id, rating) VALUES (:uid, :bid, :r)
        ON CONFLICT(user_id, book_id) DO UPDATE SET rating = :r
