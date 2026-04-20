-- name: add_book_to_shelf(sid, bid)!
INSERT OR IGNORE INTO shelf_books (shelf_id, book_id) VALUES (:sid, :bid)
