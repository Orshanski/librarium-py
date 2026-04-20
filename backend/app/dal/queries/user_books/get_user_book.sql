-- name: get_user_book(uid, bid)^
SELECT * FROM user_books WHERE user_id = :uid AND book_id = :bid
