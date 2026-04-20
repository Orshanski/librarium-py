-- name: remove_book_from_shelf(sid, bid)!
DELETE FROM shelf_books WHERE shelf_id = :sid AND book_id = :bid
