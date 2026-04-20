-- name: set_read(uid, bid, r)!
INSERT INTO user_books (user_id, book_id, is_read) VALUES (:uid, :bid, :r)
        ON CONFLICT(user_id, book_id) DO UPDATE SET is_read = :r
