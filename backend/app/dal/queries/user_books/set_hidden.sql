-- name: set_hidden(uid, bid, h)!
INSERT INTO user_books (user_id, book_id, is_hidden) VALUES (:uid, :bid, :h)
        ON CONFLICT(user_id, book_id) DO UPDATE SET is_hidden = :h
